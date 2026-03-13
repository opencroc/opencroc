import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../load-config.js';
import { createPipeline } from '../../pipeline/index.js';
import type { PipelineStep, PipelineRunResult } from '../../types.js';

const VALID_STEPS: PipelineStep[] = ['scan', 'er-diagram', 'api-chain', 'plan', 'codegen', 'validate'];

export interface GenerateOptions {
  module?: string;
  all?: boolean;
  steps?: string;
  dryRun?: boolean;
}

function parseSteps(raw?: string): PipelineStep[] | undefined {
  if (!raw) return undefined;
  const names = raw.split(',').map((s) => s.trim());
  for (const name of names) {
    if (!VALID_STEPS.includes(name as PipelineStep)) {
      throw new Error(`Unknown pipeline step "${name}". Valid steps: ${VALID_STEPS.join(', ')}`);
    }
  }
  return names as PipelineStep[];
}

function writeGeneratedFiles(result: PipelineRunResult): number {
  let written = 0;
  for (const file of result.generatedFiles) {
    const dir = dirname(file.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(file.filePath, file.content, 'utf-8');
    written++;
    console.log(chalk.green(`  ✓ ${file.filePath}`));
  }
  return written;
}

function printSummary(result: PipelineRunResult, dryRun: boolean): void {
  console.log('');
  console.log(chalk.cyan.bold('  Summary'));
  console.log(`    Modules discovered : ${result.modules.length}`);
  console.log(`    ER diagrams        : ${result.erDiagrams.size}`);
  console.log(`    Chain plans        : ${result.chainPlans.size}`);
  console.log(`    Generated files    : ${result.generatedFiles.length}${dryRun ? ' (dry-run, not written)' : ''}`);

  if (result.validationErrors.length > 0) {
    const errors = result.validationErrors.filter((e) => e.severity === 'error');
    const warnings = result.validationErrors.filter((e) => e.severity === 'warning');
    if (errors.length > 0) console.log(chalk.red(`    Errors             : ${errors.length}`));
    if (warnings.length > 0) console.log(chalk.yellow(`    Warnings           : ${warnings.length}`));

    for (const err of result.validationErrors) {
      const icon = err.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
      console.log(`    ${icon} [${err.module}] ${err.message}`);
    }
  }

  console.log(chalk.gray(`    Duration           : ${result.duration}ms`));
  console.log('');
}

export async function generate(opts: GenerateOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Generate E2E Tests\n'));

  // Load config
  const { config, filepath } = await loadConfig();
  console.log(chalk.gray(`  Config: ${filepath}`));

  // Apply --module filter
  if (opts.module) {
    config.modules = [opts.module];
  }

  // Parse --steps
  const steps = parseSteps(opts.steps);

  // Create and run pipeline
  const pipeline = createPipeline(config);
  const result = await pipeline.run(steps);

  // Write files (unless dry-run)
  if (!opts.dryRun && result.generatedFiles.length > 0) {
    console.log('');
    console.log(chalk.cyan('  Generated files:'));
    writeGeneratedFiles(result);
  } else if (opts.dryRun && result.generatedFiles.length > 0) {
    console.log('');
    console.log(chalk.yellow('  Dry-run — files that would be generated:'));
    for (const file of result.generatedFiles) {
      console.log(chalk.gray(`    ${file.filePath}`));
    }
  }

  printSummary(result, !!opts.dryRun);
}
