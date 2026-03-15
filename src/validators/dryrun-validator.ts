/**
 * Dry-run Validator — Layer 3 of three-layer module config validation.
 * Generates temporary TypeScript code from config and runs ts-morph compile check.
 */

import { Project, DiagnosticCategory } from 'ts-morph';
import type {
  ModuleTestConfig,
  ModuleConfigValidationContext,
  LayerValidationResult,
  ModuleConfigValidationError,
  ModuleConfigValidationWarning,
} from '../types.js';

export function validateDryrun(
  config: ModuleTestConfig,
  _context: ModuleConfigValidationContext,
): LayerValidationResult {
  const errors: ModuleConfigValidationError[] = [];
  const warnings: ModuleConfigValidationWarning[] = [];

  const project = new Project({
    compilerOptions: {
      strict: false,
      noEmit: true,
      target: 2, // ES2015
      module: 1, // CommonJS
      esModuleInterop: true,
      skipLibCheck: true,
    },
    useInMemoryFileSystem: true,
  });

  // Add helper type declarations
  project.createSourceFile(
    '__helpers.d.ts',
    `
declare function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: Record<string, any>,
  params?: Record<string, string>
): Promise<{ status: number; data: any }>;
declare function captureId(response: { data: any }, field?: string): string;
declare const tenantId: string;
declare const captured: Record<string, string>;
`,
  );

  // Generate and check bodyTemplates test code
  const bodyCode = generateBodyTemplateTestCode(config);
  if (bodyCode) {
    const bodyFile = project.createSourceFile('__dryrun_body_test.ts', bodyCode);
    for (const diag of bodyFile.getPreEmitDiagnostics()) {
      const msg = diag.getMessageText();
      const msgStr = typeof msg === 'string' ? msg : msg.getMessageText();
      const line = diag.getLineNumber();
      const location = line ? `bodyTemplates (line ${line})` : 'bodyTemplates';

      if (diag.getCategory() === DiagnosticCategory.Error) {
        errors.push({
          layer: 'dryrun', type: 'compile-error', path: location,
          message: `TypeScript compile error: ${msgStr}`,
          suggestion: 'Fix the body template that causes this type error',
        });
      } else if (diag.getCategory() === DiagnosticCategory.Warning) {
        warnings.push({ layer: 'dryrun', path: location, message: `TypeScript warning: ${msgStr}` });
      }
    }
  }

  // Generate and check seed test code
  const seedCode = generateSeedTestCode(config);
  if (seedCode) {
    const seedFile = project.createSourceFile('__dryrun_seed_test.ts', seedCode);
    for (const diag of seedFile.getPreEmitDiagnostics()) {
      const msg = diag.getMessageText();
      const msgStr = typeof msg === 'string' ? msg : msg.getMessageText();
      const line = diag.getLineNumber();
      const location = line ? `seed (line ${line})` : 'seed';

      if (diag.getCategory() === DiagnosticCategory.Error) {
        errors.push({
          layer: 'dryrun', type: 'compile-error', path: location,
          message: `TypeScript compile error: ${msgStr}`,
          suggestion: 'Fix the seed step that causes this type error',
        });
      } else if (diag.getCategory() === DiagnosticCategory.Warning) {
        warnings.push({ layer: 'dryrun', path: location, message: `TypeScript warning: ${msgStr}` });
      }
    }
  }

  return { passed: errors.length === 0, layer: 'dryrun', errors, warnings };
}

function generateBodyTemplateTestCode(config: ModuleTestConfig): string | null {
  if (!config.bodyTemplates || Object.keys(config.bodyTemplates).length === 0) return null;

  const lines = ['async function testBodyTemplates() {'];
  let idx = 0;
  for (const [key, body] of Object.entries(config.bodyTemplates)) {
    const spaceIdx = key.indexOf(' ');
    if (spaceIdx === -1) continue;
    const method = key.substring(0, spaceIdx);
    const routePath = key.substring(spaceIdx + 1);

    lines.push(`  const body_${idx} = ${JSON.stringify(body, null, 2)};`);
    lines.push(`  const result_${idx} = await apiRequest('${method}', '${routePath}', body_${idx});`);
    lines.push(`  if (result_${idx}.status !== 200 && result_${idx}.status !== 201) {`);
    lines.push(`    throw new Error('Unexpected status: ' + result_${idx}.status);`);
    lines.push('  }');
    idx++;
  }
  lines.push('}');
  return lines.join('\n');
}

function generateSeedTestCode(config: ModuleTestConfig): string | null {
  if (!config.seed || config.seed.length === 0) return null;

  const lines = [
    'async function testSeedSteps() {',
    '  const captured: Record<string, string> = {};',
    '',
  ];

  for (const step of config.seed) {
    if (step.body) {
      lines.push(`  const body_step${step.step} = ${JSON.stringify(step.body, null, 2)};`);
      lines.push(`  const result_step${step.step} = await apiRequest('${step.method}', '${step.path}', body_step${step.step});`);
    } else {
      lines.push(`  const result_step${step.step} = await apiRequest('${step.method}', '${step.path}');`);
    }

    if (step.captureAs) {
      lines.push(`  captured['${step.captureAs}'] = captureId(result_step${step.step});`);
    }

    if (step.required) {
      lines.push(`  if (result_step${step.step}.status >= 400) {`);
      lines.push(`    throw new Error('${step.failureMessage || `Required step ${step.step} failed`}');`);
      lines.push('  }');
    }
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}
