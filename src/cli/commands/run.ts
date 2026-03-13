import chalk from 'chalk';
import { loadConfig } from '../load-config.js';
import { createOrchestrator } from '../../orchestrator/index.js';
import { writeOrchestrationSummary, printOrchestrationSummary } from '../../orchestrator/reporter.js';
import type { OrchestrationPhase } from '../../orchestrator/index.js';

export interface RunOptions {
  module?: string;
  phases?: string;
  selfHeal?: boolean;
  headed?: boolean;
  report?: string;
  tokenBudget?: string;
  abortOnError?: boolean;
}

const VALID_PHASES: OrchestrationPhase[] = ['generate', 'execute', 'analyze', 'heal', 'report'];

function parsePhases(raw?: string): OrchestrationPhase[] | undefined {
  if (!raw) return undefined;
  const names = raw.split(',').map((s) => s.trim());
  for (const name of names) {
    if (!VALID_PHASES.includes(name as OrchestrationPhase)) {
      console.log(chalk.red(`  Unknown phase "${name}". Valid: ${VALID_PHASES.join(', ')}`));
      process.exitCode = 1;
      return undefined;
    }
  }
  return names as OrchestrationPhase[];
}

export async function run(opts: RunOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Full Orchestration\n'));

  const { config, filepath } = await loadConfig();
  console.log(chalk.gray(`  Config: ${filepath}`));

  const phases = parsePhases(opts.phases);
  if (phases === undefined && opts.phases) return;

  const reportFormats = (opts.report ?? 'html,json').split(',').map((s) => s.trim()) as ('html' | 'json' | 'markdown')[];

  const orchestrator = createOrchestrator(config, {
    phases,
    selfHeal: opts.selfHeal ?? false,
    headed: opts.headed ?? false,
    module: opts.module,
    reportFormats,
    tokenBudget: opts.tokenBudget ? parseInt(opts.tokenBudget, 10) : 0,
    abortOnError: opts.abortOnError ?? false,
  });

  console.log(chalk.gray(`  Phases: ${(phases ?? VALID_PHASES).join(' → ')}`));
  if (opts.selfHeal) console.log(chalk.gray('  Self-heal: enabled'));
  console.log('');

  const summary = await orchestrator.run();

  // Print console summary
  const lines = printOrchestrationSummary(summary);
  for (const line of lines) {
    const color =
      summary.overallStatus === 'success' ? chalk.green :
      summary.overallStatus === 'partial-fail' ? chalk.yellow :
      chalk.red;
    console.log(color(line));
  }

  // Write JSON summary
  const outDir = config.outDir || './opencroc-output';
  const summaryPath = writeOrchestrationSummary(summary, { outputDir: outDir, module: opts.module });
  console.log(chalk.gray(`  Summary: ${summaryPath}\n`));

  if (summary.overallStatus !== 'success') {
    process.exitCode = 1;
  }
}
