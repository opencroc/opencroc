import * as fs from 'fs';
import * as path from 'path';
import type {
  OpenCrocConfig,
  PipelineRunResult,
  PipelineStep,
  ERDiagramResult,
  ChainPlanResult,
} from '../types.js';
import { parseModuleModels } from '../parsers/model-parser.js';
import { parseControllerDirectory } from '../parsers/controller-parser.js';
import { parseAssociationFile } from '../parsers/association-parser.js';
import { createApiChainAnalyzer, topologicalSort } from '../analyzers/api-chain-analyzer.js';
import { createERDiagramGenerator } from '../generators/er-diagram-generator.js';
import { createTestCodeGenerator } from '../generators/test-code-generator.js';
import { validateConfig } from '../validators/config-validator.js';

export interface Pipeline {
  run(steps?: PipelineStep[]): Promise<PipelineRunResult>;
}

const ALL_STEPS: PipelineStep[] = ['scan', 'er-diagram', 'api-chain', 'plan', 'codegen', 'validate'];

export function createPipeline(config: OpenCrocConfig): Pipeline {
  return {
    async run(steps) {
      const startTime = Date.now();
      const activeSteps = steps || config.steps || ALL_STEPS;

      const result: PipelineRunResult = {
        modules: [],
        erDiagrams: new Map(),
        chainPlans: new Map(),
        generatedFiles: [],
        validationErrors: [],
        duration: 0,
      };

      const backendRoot = path.resolve(config.backendRoot);

      // Smart discovery: find models/ and controllers/ in common locations
      const findDir = (name: string): string | null => {
        const candidates = [
          path.join(backendRoot, name),                   // ./models
          path.join(backendRoot, 'src', name),             // ./src/models
          path.join(backendRoot, 'backend', 'src', name),  // ./backend/src/models
          path.join(backendRoot, 'backend', name),         // ./backend/models
          path.join(backendRoot, 'server', 'src', name),   // ./server/src/models
          path.join(backendRoot, 'app', name),             // ./app/models
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) return c;
        }
        return null;
      };

      const modelsRoot = findDir('models');
      const controllersRoot = findDir('controllers');

      // Step 1: Scan — discover modules
      if (activeSteps.includes('scan')) {
        if (modelsRoot) {
          // Discover modules from subdirectories
          const dirs = fs.readdirSync(modelsRoot, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

          const moduleFilter = config.modules;
          for (const dir of dirs) {
            if (moduleFilter && !moduleFilter.includes(dir)) continue;
            result.modules.push(dir);
          }

          // If no subdirectories, treat root as single "default" module
          if (result.modules.length === 0) {
            result.modules.push('default');
          } else {
            // Also include root-level model files as "default" module
            const rootFiles = fs.readdirSync(modelsRoot)
              .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');
            if (rootFiles.length > 0) {
              result.modules.unshift('default');
            }
          }
        }
      }

      // Helper: resolve model dir for a module
      const resolveModelDir = (_backendRoot: string, mod: string): string =>
        mod === 'default'
          ? (modelsRoot || path.join(backendRoot, 'models'))
          : path.join(modelsRoot || path.join(backendRoot, 'models'), mod);

      // Helper: resolve controller dir for a module
      const resolveControllerDir = (_backendRoot: string, mod: string): string =>
        mod === 'default'
          ? (controllersRoot || path.join(backendRoot, 'controllers'))
          : path.join(controllersRoot || path.join(backendRoot, 'controllers'), mod);

      // Step 2: ER Diagram — parse models and generate relationship graphs
      if (activeSteps.includes('er-diagram')) {
        const erGen = createERDiagramGenerator();
        const backendRoot = path.resolve(config.backendRoot);

        for (const mod of result.modules) {
          const modelDir = resolveModelDir(backendRoot, mod);

          // For flat layouts, scan all model files for embedded associations
          const tables = fs.existsSync(modelDir) ? parseModuleModels(modelDir) : [];
          const relations: import('../types.js').ForeignKeyRelation[] = [];

          // Check for dedicated associations.ts first
          const assocFile = path.join(modelDir, 'associations.ts');
          if (fs.existsSync(assocFile)) {
            relations.push(...parseAssociationFile(assocFile));
          }

          // Also scan model files for embedded associations (belongsTo/hasMany at end of file)
          if (fs.existsSync(modelDir)) {
            const modelFiles = fs.readdirSync(modelDir)
              .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'associations.ts');
            for (const file of modelFiles) {
              try {
                const embedded = parseAssociationFile(path.join(modelDir, file));
                relations.push(...embedded);
              } catch {
                // skip files that fail to parse
              }
            }
          }

          const erResult: ERDiagramResult = erGen.generate(tables, relations);
          result.erDiagrams.set(mod, erResult);
        }
      }

      // Step 3: API Chain — analyze controller routes and build dependency DAG
      if (activeSteps.includes('api-chain')) {
        const chainAnalyzer = createApiChainAnalyzer();
        const backendRoot = path.resolve(config.backendRoot);

        for (const mod of result.modules) {
          const controllerDir = resolveControllerDir(backendRoot, mod);
          const endpoints = fs.existsSync(controllerDir)
            ? parseControllerDirectory(controllerDir)
            : [];

          const analysis = chainAnalyzer.analyze(endpoints);
          analysis.moduleName = mod;

          if (analysis.hasCycles) {
            for (const warning of analysis.cycleWarnings) {
              result.validationErrors.push({
                module: mod,
                field: 'api-chain',
                message: warning,
                severity: 'warning',
              });
            }
          }
        }
      }

      // Step 4: Plan — generate test chains from dependency analysis
      if (activeSteps.includes('plan')) {
        const backendRoot = path.resolve(config.backendRoot);
        const chainAnalyzer = createApiChainAnalyzer();

        for (const mod of result.modules) {
          const controllerDir = resolveControllerDir(backendRoot, mod);
          const endpoints = fs.existsSync(controllerDir)
            ? parseControllerDirectory(controllerDir)
            : [];

          const analysis = chainAnalyzer.analyze(endpoints);
          const topoOrder = topologicalSort(analysis.dag);

          // Group by resource to create chains
          const chains = generateChainPlan(mod, endpoints, topoOrder);
          result.chainPlans.set(mod, chains);
        }
      }

      // Step 5: Codegen — emit Playwright test files from chain plans
      if (activeSteps.includes('codegen')) {
        const testGen = createTestCodeGenerator();
        const outDir = config.outDir || './opencroc-output';

        for (const [_mod, plan] of result.chainPlans) {
          const files = testGen.generate(plan.chains);
          for (const file of files) {
            file.filePath = path.join(outDir, file.filePath);
          }
          result.generatedFiles.push(...files);
        }
      }

      // Step 6: Validate — run validation on generated configs
      if (activeSteps.includes('validate')) {
        const configErrors = validateConfig(config as unknown as Record<string, unknown>);
        result.validationErrors.push(...configErrors);
      }

      result.duration = Date.now() - startTime;
      return result;
    },
  };
}

/**
 * Generate a basic chain plan from endpoints and topological order.
 */
function generateChainPlan(
  moduleName: string,
  endpoints: import('../types.js').ApiEndpoint[],
  _topoOrder: string[],
): ChainPlanResult {
  // Group endpoints by resource (first non-param path segment)
  const groups = new Map<string, import('../types.js').ApiEndpoint[]>();

  for (const ep of endpoints) {
    const segments = ep.path.split('/').filter((s) => s && !s.startsWith(':'));
    const resource = segments[segments.length - 1] || 'default';
    if (!groups.has(resource)) groups.set(resource, []);
    groups.get(resource)!.push(ep);
  }

  const chains: import('../types.js').TestChain[] = [];
  let totalSteps = 0;

  for (const [resource, eps] of groups) {
    const steps: import('../types.js').TestStep[] = eps.map((ep, i) => ({
      order: i + 1,
      action: ep.method,
      endpoint: ep,
      description: ep.description || `${ep.method} ${ep.path}`,
      assertions: [],
    }));

    chains.push({ name: `${resource} CRUD chain`, module: moduleName, steps });
    totalSteps += steps.length;
  }

  return { chains, totalSteps };
}
