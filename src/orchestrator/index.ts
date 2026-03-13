/**
 * Full orchestration engine: generate → execute → analyze → heal → report.
 *
 * Runs a multi-phase pipeline with per-phase tracking, failure detection,
 * token budget management, and structured result reporting.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  OpenCrocConfig,
  PipelineRunResult,
  SelfHealingConfig,
  SelfHealingResult,
} from '../types.js';
import { createPipeline } from '../pipeline/index.js';
import { createSelfHealingLoop } from '../self-healing/index.js';
import { generateReports } from '../reporters/index.js';
import type { ReportOutput } from '../reporters/index.js';

// ===== Types =====

export type PhaseStatus = 'success' | 'warn' | 'error' | 'skipped';

export interface PhaseResult<T = unknown> {
  phase: string;
  status: PhaseStatus;
  output?: T;
  error?: string;
  durationMs: number;
}

export interface OrchestrationOptions {
  /** Which phases to run (default: all) */
  phases?: OrchestrationPhase[];
  /** Enable self-healing phase (default: false) */
  selfHeal?: boolean;
  /** Max self-healing iterations */
  maxHealIterations?: number;
  /** Report formats to generate */
  reportFormats?: ('html' | 'json' | 'markdown')[];
  /** Run Playwright in headed mode */
  headed?: boolean;
  /** Module filter */
  module?: string;
  /** LLM token budget (0 = unlimited) */
  tokenBudget?: number;
  /** Abort on phase error (default: false — continue where possible) */
  abortOnError?: boolean;
}

export type OrchestrationPhase = 'generate' | 'execute' | 'analyze' | 'heal' | 'report';

export interface ExecutionMetrics {
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
}

export interface OrchestrationSummary {
  overallStatus: 'success' | 'partial-fail' | 'fatal-fail';
  phases: PhaseResult[];
  totalDurationMs: number;
  modules: string[];
  executionMetrics?: ExecutionMetrics;
  reports?: ReportOutput[];
  healingResult?: SelfHealingResult;
  recommendation?: string;
}

const ALL_PHASES: OrchestrationPhase[] = ['generate', 'execute', 'analyze', 'heal', 'report'];

// ===== Helpers =====

function discoverTestFiles(outDir: string, moduleFilter?: string): string[] {
  const absDir = join(process.cwd(), outDir);
  if (!existsSync(absDir)) return [];

  const files: string[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts')) continue;
    const fullPath = join(
      entry.parentPath || (entry as unknown as { path: string }).path || absDir,
      entry.name,
    );
    if (moduleFilter && !fullPath.includes(moduleFilter)) continue;
    files.push(fullPath);
  }
  return files;
}

function parsePlaywrightOutput(stderr: string): ExecutionMetrics {
  const metrics: ExecutionMetrics = { passed: 0, failed: 0, skipped: 0, timedOut: 0 };

  // Playwright summary line: "X passed", "Y failed", "Z skipped"
  const passedMatch = stderr.match(/(\d+)\s+passed/);
  const failedMatch = stderr.match(/(\d+)\s+failed/);
  const skippedMatch = stderr.match(/(\d+)\s+skipped/);
  const timedOutMatch = stderr.match(/(\d+)\s+timed?\s*out/i);

  if (passedMatch) metrics.passed = parseInt(passedMatch[1], 10);
  if (failedMatch) metrics.failed = parseInt(failedMatch[1], 10);
  if (skippedMatch) metrics.skipped = parseInt(skippedMatch[1], 10);
  if (timedOutMatch) metrics.timedOut = parseInt(timedOutMatch[1], 10);

  return metrics;
}

// ===== Orchestrator =====

export function createOrchestrator(config: OpenCrocConfig, options: OrchestrationOptions = {}) {
  const {
    phases = ALL_PHASES,
    selfHeal = false,
    maxHealIterations = 3,
    reportFormats = ['html', 'json'],
    headed = false,
    module: moduleFilter,
    tokenBudget = 0,
    abortOnError = false,
  } = options;

  const outDir = config.outDir || './opencroc-output';
  const phaseResults: PhaseResult[] = [];
  let pipelineResult: PipelineRunResult | undefined;
  let executionMetrics: ExecutionMetrics | undefined;
  let healingResult: SelfHealingResult | undefined;
  let reports: ReportOutput[] | undefined;
  let tokensUsed = 0;

  function isBudgetExceeded(): boolean {
    return tokenBudget > 0 && tokensUsed >= tokenBudget;
  }

  function shouldRun(phase: OrchestrationPhase): boolean {
    if (phase === 'heal' && !selfHeal) return false;
    return phases.includes(phase);
  }

  async function runPhase<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<PhaseResult<T>> {
    const start = Date.now();
    try {
      const output = await fn();
      const result: PhaseResult<T> = {
        phase: name,
        status: 'success',
        output,
        durationMs: Date.now() - start,
      };
      phaseResults.push(result);
      return result;
    } catch (err) {
      const result: PhaseResult<T> = {
        phase: name,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      phaseResults.push(result);
      return result;
    }
  }

  function skipPhase(name: string, reason: string): PhaseResult {
    const result: PhaseResult = {
      phase: name,
      status: 'skipped',
      error: reason,
      durationMs: 0,
    };
    phaseResults.push(result);
    return result;
  }

  return {
    async run(): Promise<OrchestrationSummary> {
      const orchestrationStart = Date.now();

      // ── Phase 1: Generate ──
      if (shouldRun('generate')) {
        const genResult = await runPhase('generate', async () => {
          if (moduleFilter) config.modules = [moduleFilter];
          const pipeline = createPipeline(config);
          pipelineResult = await pipeline.run();

          // Write generated files
          for (const file of pipelineResult.generatedFiles) {
            const dir = dirname(file.filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(file.filePath, file.content, 'utf-8');
          }

          return pipelineResult;
        });

        if (genResult.status === 'error' && abortOnError) {
          return buildSummary(orchestrationStart);
        }
      }

      // ── Phase 2: Execute ──
      if (shouldRun('execute')) {
        const testFiles = discoverTestFiles(outDir, moduleFilter);

        if (testFiles.length === 0) {
          skipPhase('execute', 'No test files found');
        } else {
          const execResult = await runPhase('execute', async () => {
            const args = ['test', ...testFiles];
            if (!headed) args.push('--reporter=list');
            else args.push('--headed');

            const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

            try {
              execFileSync(npxCmd, ['playwright', ...args], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 300_000,
              });
              return { passed: testFiles.length, failed: 0, skipped: 0, timedOut: 0 } as ExecutionMetrics;
            } catch (err) {
              const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
              const metrics = parsePlaywrightOutput(stderr);
              if (metrics.passed === 0 && metrics.failed === 0) {
                metrics.failed = testFiles.length;
              }
              executionMetrics = metrics;
              if (metrics.failed > 0) {
                throw new Error(`${metrics.failed} test(s) failed, ${metrics.passed} passed`, { cause: err });
              }
              return metrics;
            }
          });

          if (!executionMetrics && execResult.output) {
            executionMetrics = execResult.output as ExecutionMetrics;
          }

          if (execResult.status === 'error' && abortOnError) {
            return buildSummary(orchestrationStart);
          }
        }
      }

      // ── Phase 3: Analyze ──
      if (shouldRun('analyze')) {
        if (!pipelineResult || !executionMetrics || executionMetrics.failed === 0) {
          skipPhase('analyze', 'No failures to analyze');
        } else {
          await runPhase('analyze', async () => {
            // Re-run pipeline validation for failure context
            const pipeline = createPipeline(config);
            const validationResult = await pipeline.run(['validate']);
            return {
              validationErrors: validationResult.validationErrors,
              failedTestCount: executionMetrics!.failed,
            };
          });
        }
      }

      // ── Phase 4: Heal ──
      if (shouldRun('heal')) {
        if (isBudgetExceeded()) {
          skipPhase('heal', 'Token budget exceeded');
        } else if (!executionMetrics || executionMetrics.failed === 0) {
          skipPhase('heal', 'No failures to heal');
        } else {
          const healResult = await runPhase('heal', async () => {
            const healConfig: SelfHealingConfig = {
              enabled: true,
              maxIterations: maxHealIterations,
              mode: config.selfHealing?.mode || 'config-only',
            };

            const loop = createSelfHealingLoop(healConfig);
            const result = await loop.run(outDir);
            tokensUsed += result.totalTokensUsed;
            healingResult = result;
            return result;
          });

          if (healResult.status === 'success' && healingResult && healingResult.remaining.length > 0) {
            healResult.status = 'warn';
            phaseResults[phaseResults.length - 1] = healResult;
          }
        }
      }

      // ── Phase 5: Report ──
      if (shouldRun('report')) {
        if (!pipelineResult) {
          skipPhase('report', 'No pipeline results to report');
        } else {
          await runPhase('report', async () => {
            reports = generateReports(pipelineResult!, reportFormats);

            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            for (const r of reports) {
              writeFileSync(join(outDir, r.filename), r.content, 'utf-8');
            }

            return reports;
          });
        }
      }

      return buildSummary(orchestrationStart);
    },
  };

  function buildSummary(startTime: number): OrchestrationSummary {
    const errorCount = phaseResults.filter((p) => p.status === 'error').length;
    const allSuccess = phaseResults.every((p) => p.status === 'success' || p.status === 'skipped');

    let overallStatus: OrchestrationSummary['overallStatus'];
    if (allSuccess) overallStatus = 'success';
    else if (errorCount > 1) overallStatus = 'fatal-fail';
    else overallStatus = 'partial-fail';

    let recommendation: string | undefined;
    if (executionMetrics && executionMetrics.failed > 0 && !selfHeal) {
      recommendation = 'Test failures detected. Consider running with --self-heal to attempt automated fixes.';
    } else if (healingResult && healingResult.remaining.length > 0) {
      recommendation = `${healingResult.remaining.length} issue(s) could not be auto-fixed. Manual review needed.`;
    }

    return {
      overallStatus,
      phases: phaseResults,
      totalDurationMs: Date.now() - startTime,
      modules: pipelineResult?.modules ?? [],
      executionMetrics,
      reports,
      healingResult,
      recommendation,
    };
  }
}
