import type { WebSocket } from 'ws';
import type { OpenCrocConfig, PipelineRunResult, GeneratedTestFile } from '../types.js';

export interface CrocAgent {
  id: string;
  name: string;
  role: 'parser' | 'analyzer' | 'tester' | 'healer' | 'planner' | 'reporter';
  sprite: string;
  status: 'idle' | 'working' | 'thinking' | 'done' | 'error';
  currentTask?: string;
  tokensUsed: number;
  progress?: number; // 0-100
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: 'model' | 'controller' | 'api' | 'dto' | 'module';
  status: 'idle' | 'testing' | 'passed' | 'failed';
  fields?: string[];
  module?: string;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface ProjectInfo {
  name: string;
  backendRoot: string;
  adapter: string;
  stats: {
    modules: number;
    models: number;
    endpoints: number;
    relations: number;
  };
  graph: KnowledgeGraph;
  agents: CrocAgent[];
}

export interface TaskResult {
  ok: boolean;
  task: string;
  duration: number;
  details?: Record<string, unknown>;
  error?: string;
}

const DEFAULT_AGENTS: CrocAgent[] = [
  { id: 'parser-croc',   name: '解析鳄',  role: 'parser',   sprite: 'parser',   status: 'idle', tokensUsed: 0 },
  { id: 'analyzer-croc', name: '分析鳄',  role: 'analyzer', sprite: 'analyzer', status: 'idle', tokensUsed: 0 },
  { id: 'tester-croc',   name: '测试鳄',  role: 'tester',   sprite: 'tester',   status: 'idle', tokensUsed: 0 },
  { id: 'healer-croc',   name: '修复鳄',  role: 'healer',   sprite: 'healer',   status: 'idle', tokensUsed: 0 },
  { id: 'planner-croc',  name: '规划鳄',  role: 'planner',  sprite: 'planner',  status: 'idle', tokensUsed: 0 },
  { id: 'reporter-croc', name: '汇报鳄',  role: 'reporter', sprite: 'reporter', status: 'idle', tokensUsed: 0 },
];

export class CrocOffice {
  private config: OpenCrocConfig;
  private cwd: string;
  private clients: Set<WebSocket> = new Set();
  private agents: CrocAgent[];
  private cachedGraph: KnowledgeGraph | null = null;
  private running = false;
  private lastPipelineResult: PipelineRunResult | null = null;
  private lastGeneratedFiles: GeneratedTestFile[] = [];

  constructor(config: OpenCrocConfig, cwd: string) {
    this.config = config;
    this.cwd = cwd;
    this.agents = DEFAULT_AGENTS.map((a) => ({ ...a }));
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(type: string, payload: unknown): void {
    const msg = JSON.stringify({ type, payload });
    for (const client of this.clients) {
      try {
        client.send(msg);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /** Send a log message to all clients */
  log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    this.broadcast('log', { message, level, time: Date.now() });
  }

  getAgents(): CrocAgent[] {
    return this.agents;
  }

  getAgent(id: string): CrocAgent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  updateAgent(id: string, update: Partial<CrocAgent>): void {
    const agent = this.agents.find((a) => a.id === id);
    if (agent) {
      Object.assign(agent, update);
      this.broadcast('agent:update', this.agents);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): OpenCrocConfig {
    return this.config;
  }

  getCwd(): string {
    return this.cwd;
  }

  // ============ Real Task Dispatch ============

  /** Run the full scan → graph build pipeline */
  async runScan(): Promise<TaskResult> {
    if (this.running) return { ok: false, task: 'scan', duration: 0, error: 'Another task is running' };
    this.running = true;
    const start = Date.now();

    try {
      this.invalidateCache();
      this.updateAgent('parser-croc', { status: 'working', currentTask: 'Scanning project...', progress: 0 });
      this.log('🔍 Parser croc is scanning the project...');

      const graph = await this.buildKnowledgeGraph();

      const duration = Date.now() - start;
      this.log(`✅ Scan complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges (${duration}ms)`);
      return { ok: true, task: 'scan', duration, details: { nodes: graph.nodes.length, edges: graph.edges.length } };
    } catch (err) {
      this.updateAgent('parser-croc', { status: 'error', currentTask: String(err) });
      this.log(`❌ Scan failed: ${err}`, 'error');
      return { ok: false, task: 'scan', duration: Date.now() - start, error: String(err) };
    } finally {
      this.running = false;
    }
  }

  /** Run the real pipeline: scan → er-diagram → api-chain → plan → codegen → report */
  async runPipeline(): Promise<TaskResult> {
    if (this.running) return { ok: false, task: 'pipeline', duration: 0, error: 'Another task is running' };
    this.running = true;
    const start = Date.now();

    try {
      const { resolve: resolvePath } = await import('node:path');
      const { createPipeline } = await import('../pipeline/index.js');

      const backendRoot = resolvePath(this.cwd, this.config.backendRoot);
      const pipelineConfig = { ...this.config, backendRoot };
      const pipeline = createPipeline(pipelineConfig);

      // Phase 1: Scan + ER Diagram (解析鳄)
      this.updateAgent('parser-croc', { status: 'working', currentTask: 'Scanning source code...', progress: 10 });
      this.log(`🐊 解析鳄 scanning from: ${backendRoot}`);
      this.invalidateCache();
      await this.buildKnowledgeGraph();
      this.updateNodeStatus('module', 'testing');

      // Run real pipeline: scan + er-diagram
      this.updateAgent('parser-croc', { currentTask: 'Parsing models & ER diagrams...', progress: 40 });
      const scanResult = await pipeline.run(['scan', 'er-diagram']);
      const moduleCount = scanResult.modules.length;
      const erCount = scanResult.erDiagrams.size;
      this.log(`📊 Found ${moduleCount} modules, ${erCount} ER diagrams`);
      this.updateAgent('parser-croc', { status: 'done', currentTask: `${moduleCount} modules parsed`, progress: 100 });

      // Phase 2: API Chain Analysis (分析鳄)
      this.updateAgent('analyzer-croc', { status: 'working', currentTask: 'Analyzing API chains...', progress: 0 });
      this.log('🐊 分析鳄 is analyzing API dependencies...');
      const analyzeResult = await pipeline.run(['api-chain']);
      const warnings = analyzeResult.validationErrors.filter(e => e.severity === 'warning');
      if (warnings.length > 0) {
        this.log(`⚠️ ${warnings.length} API chain warnings`, 'warn');
      }
      this.updateAgent('analyzer-croc', { status: 'done', currentTask: 'Analysis complete', progress: 100 });

      // Phase 3: Plan test chains (规划鳄)
      this.updateAgent('planner-croc', { status: 'thinking', currentTask: 'Planning test chains...', progress: 0 });
      this.log('🐊 规划鳄 is planning test chains...');
      const planResult = await pipeline.run(['plan']);
      let totalChains = 0, totalSteps = 0;
      for (const [, plan] of planResult.chainPlans) {
        totalChains += plan.chains.length;
        totalSteps += plan.totalSteps;
      }
      this.log(`📋 Planned ${totalChains} test chains with ${totalSteps} steps`);
      this.updateAgent('planner-croc', { status: 'done', currentTask: `${totalChains} chains planned`, progress: 100 });

      // Phase 4: Generate test code (测试鳄)
      this.updateAgent('tester-croc', { status: 'working', currentTask: 'Generating test code...', progress: 0 });
      this.log('🐊 测试鳄 is generating Playwright test code...');
      this.updateNodeStatus('controller', 'testing');

      // Full pipeline run for codegen (it needs prior steps' results internally)
      const fullResult = await pipeline.run(['scan', 'er-diagram', 'api-chain', 'plan', 'codegen']);
      this.lastPipelineResult = fullResult;
      this.lastGeneratedFiles = fullResult.generatedFiles;

      // Write generated files to disk
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      let filesWritten = 0;
      for (const file of fullResult.generatedFiles) {
        const fullPath = resolvePath(this.cwd, file.filePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, file.content, 'utf-8');
        filesWritten++;
      }

      this.updateNodeStatus('controller', 'passed');
      this.log(`✅ Generated ${filesWritten} test files`);
      this.updateAgent('tester-croc', { status: 'done', currentTask: `${filesWritten} files generated`, progress: 100 });

      // Broadcast generated files to frontend
      this.broadcast('files:generated', fullResult.generatedFiles.map(f => ({
        filePath: f.filePath,
        module: f.module,
        chain: f.chain,
        lines: f.content.split('\n').length,
      })));

      // Phase 5: Report (汇报鳄)
      this.updateAgent('reporter-croc', { status: 'working', currentTask: 'Compiling report...', progress: 0 });
      this.log('🐊 汇报鳄 is compiling results...');

      // Validation
      const validateResult = await pipeline.run(['validate']);
      const errors = validateResult.validationErrors.filter(e => e.severity === 'error');
      if (errors.length > 0) {
        this.log(`⚠️ ${errors.length} validation errors`, 'warn');
      }

      this.updateNodeStatus('module', 'passed');
      this.updateAgent('reporter-croc', { status: 'done', currentTask: 'Report ready', progress: 100 });

      const duration = Date.now() - start;
      this.log(`✅ Pipeline complete in ${duration}ms — ${moduleCount} modules, ${totalChains} chains, ${filesWritten} files`);
      this.broadcast('pipeline:complete', {
        duration, status: 'success',
        summary: { modules: moduleCount, chains: totalChains, steps: totalSteps, files: filesWritten },
      });
      return { ok: true, task: 'pipeline', duration, details: {
        modules: moduleCount, chains: totalChains, steps: totalSteps, files: filesWritten,
      }};
    } catch (err) {
      this.updateAgent('tester-croc', { status: 'error', currentTask: String(err) });
      this.log(`❌ Pipeline failed: ${err}`, 'error');
      this.broadcast('pipeline:complete', { status: 'error', error: String(err) });
      return { ok: false, task: 'pipeline', duration: Date.now() - start, error: String(err) };
    } finally {
      this.running = false;
    }
  }

  /** Reset all agents to idle */
  resetAgents(): void {
    for (const agent of this.agents) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.progress = undefined;
    }
    this.broadcast('agent:update', this.agents);
  }

  /** Get last pipeline result */
  getLastPipelineResult(): PipelineRunResult | null {
    return this.lastPipelineResult;
  }

  /** Get generated test files from last pipeline run */
  getGeneratedFiles(): GeneratedTestFile[] {
    return this.lastGeneratedFiles;
  }

  // ============ Graph Helpers ============

  private updateNodeStatus(type: KnowledgeGraphNode['type'], status: KnowledgeGraphNode['status']): void {
    if (!this.cachedGraph) return;
    for (const node of this.cachedGraph.nodes) {
      if (node.type === type) {
        node.status = status;
      }
    }
    this.broadcast('graph:update', this.cachedGraph);
  }

  /** Build knowledge graph from project source code */
  async buildKnowledgeGraph(): Promise<KnowledgeGraph> {
    if (this.cachedGraph) return this.cachedGraph;

    this.updateAgent('parser-croc', { status: 'working', currentTask: 'Scanning project structure...', progress: 20 });

    try {
      const { resolve: resolvePath } = await import('node:path');
      const { glob } = await import('glob');

      const backendRoot = resolvePath(this.cwd, this.config.backendRoot);
      const nodes: KnowledgeGraphNode[] = [];
      const edges: KnowledgeGraphEdge[] = [];
      const moduleSet = new Set<string>();

      // Helper: infer module from file path
      // 1) Subfolder: models/aigc/Foo.ts → "aigc"
      // 2) Longest known prefix match on filename: workflowTemplate → "workflow"
      // 3) CamelCase first word: DataModel → "data"

      // Known domain prefixes, longest first for greedy matching
      const KNOWN_PREFIXES = [
        'notification', 'department', 'application', 'permission', 'computed',
        'delegation', 'dictionary', 'validation', 'simulation', 'statistics',
        'inference', 'panorama', 'designer', 'workflow', 'template', 'relation',
        'recycle', 'monitor', 'timeout', 'column', 'export', 'import', 'batch',
        'field', 'chain', 'tenant', 'model', 'data', 'user', 'role', 'menu',
        'auth', 'dept', 'page', 'app', 'api', 'org', 'log', 'er',
      ];

      const DOMAIN_GROUPS: Record<string, string> = {
        app: 'app', api: 'api', data: 'data', auth: 'auth',
        user: 'user', role: 'user', menu: 'app', dept: 'org',
        department: 'org', org: 'org', chain: 'workflow',
        workflow: 'workflow', batch: 'batch', column: 'data',
        computed: 'data', designer: 'designer', monitor: 'monitor',
        notification: 'notification', permission: 'permission',
        template: 'template', validation: 'validation',
        field: 'data', delegation: 'workflow', import: 'data',
        export: 'data', dictionary: 'data', panorama: 'panorama',
        inference: 'inference', simulation: 'simulation', er: 'data',
        relation: 'data', recycle: 'data', statistics: 'statistics',
        operation: 'system', log: 'system', timeout: 'workflow',
        tenant: 'system', model: 'data', page: 'app',
        application: 'app',
      };

      const inferModule = (filePath: string, type: 'model' | 'controller'): string => {
        const parts = filePath.replace(/\\/g, '/').split('/');
        // Subfolder detection
        const typeDir = type === 'model' ? 'models' : 'controllers';
        const typeDirIdx = parts.indexOf(typeDir);
        if (typeDirIdx >= 0 && parts.length - typeDirIdx > 2) {
          return parts[typeDirIdx + 1];
        }
        // Filename-based: strip extension + "Controller" suffix
        const baseName = parts[parts.length - 1]
          .replace(/\.(ts|js)$/, '')
          .replace(/Controller$/i, '');
        const lc = baseName.toLowerCase();
        // Try longest known prefix match
        for (const prefix of KNOWN_PREFIXES) {
          if (lc.startsWith(prefix)) {
            return DOMAIN_GROUPS[prefix] || prefix;
          }
        }
        // CamelCase first word fallback
        const camelMatch = baseName.match(/^([A-Z]?[a-z]+)/);
        if (camelMatch) {
          const w = camelMatch[1].toLowerCase();
          return DOMAIN_GROUPS[w] || w;
        }
        return 'other';
      };

      // Scan for models
      this.updateAgent('parser-croc', { progress: 40, currentTask: 'Scanning models...' });
      const modelFiles = await glob('**/models/**/*.{ts,js}', {
        cwd: backendRoot,
        ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '**/index.*', '**/dist/**'],
      });

      for (const file of modelFiles) {
        const parts = file.replace(/\\/g, '/').split('/');
        const moduleName = inferModule(file, 'model');
        const fileName = parts[parts.length - 1].replace(/\.(ts|js)$/, '');
        const nodeId = `model:${fileName}`;

        moduleSet.add(moduleName);
        nodes.push({
          id: nodeId,
          label: fileName,
          type: 'model',
          status: 'idle',
          module: moduleName,
        });
      }

      // Scan for controllers
      this.updateAgent('parser-croc', { progress: 70, currentTask: 'Scanning controllers...' });
      const controllerFiles = await glob('**/controllers/**/*.{ts,js}', {
        cwd: backendRoot,
        ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '**/index.*', '**/dist/**'],
      });

      for (const file of controllerFiles) {
        const parts = file.replace(/\\/g, '/').split('/');
        const moduleName = inferModule(file, 'controller');
        const fileName = parts[parts.length - 1].replace(/\.(ts|js)$/, '').replace(/Controller$/, '');
        const nodeId = `controller:${fileName}`;

        moduleSet.add(moduleName);
        nodes.push({
          id: nodeId,
          label: `${fileName} (ctrl)`,
          type: 'controller',
          status: 'idle',
          module: moduleName,
        });

        // Link controller to its model with fuzzy match
        const lcName = fileName.toLowerCase();
        const modelNode = nodes.find((n) => n.type === 'model' && n.label.toLowerCase() === lcName);
        if (modelNode) {
          edges.push({ source: nodeId, target: modelNode.id, relation: 'uses' });
        }
      }

      // Add module nodes
      this.updateAgent('parser-croc', { progress: 90, currentTask: 'Building graph...' });
      for (const mod of moduleSet) {
        const moduleNodeId = `module:${mod}`;
        nodes.push({
          id: moduleNodeId,
          label: mod,
          type: 'module',
          status: 'idle',
        });

        // Link models/controllers to their module
        for (const n of nodes) {
          if (n.module === mod && n.type !== 'module') {
            edges.push({ source: moduleNodeId, target: n.id, relation: 'contains' });
          }
        }
      }

      this.cachedGraph = { nodes, edges };
      this.updateAgent('parser-croc', { status: 'done', currentTask: `Found ${nodes.length} nodes`, progress: 100 });
      this.broadcast('graph:update', this.cachedGraph);
      return this.cachedGraph;

    } catch (err) {
      this.updateAgent('parser-croc', { status: 'error', currentTask: String(err) });
      return { nodes: [], edges: [] };
    }
  }

  invalidateCache(): void {
    this.cachedGraph = null;
  }

  async getProjectInfo(): Promise<ProjectInfo> {
    const graph = await this.buildKnowledgeGraph();
    const stats = {
      modules: graph.nodes.filter((n) => n.type === 'module').length,
      models: graph.nodes.filter((n) => n.type === 'model').length,
      endpoints: graph.nodes.filter((n) => n.type === 'api' || n.type === 'controller').length,
      relations: graph.edges.length,
    };

    return {
      name: this.config.backendRoot.split('/').pop() || 'project',
      backendRoot: this.config.backendRoot,
      adapter: typeof this.config.adapter === 'string' ? this.config.adapter : 'custom',
      stats,
      graph,
      agents: this.agents,
    };
  }
}
