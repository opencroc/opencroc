/**
 * Orchestration summary reporter.
 * Writes phase-by-phase JSON and a human-readable console summary.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { OrchestrationSummary, PhaseResult } from './index.js';

export interface OrchestrationReportOptions {
  outputDir: string;
  module?: string;
}

/**
 * Write the orchestration summary to a JSON file.
 * Returns the written file path.
 */
export function writeOrchestrationSummary(
  summary: OrchestrationSummary,
  options: OrchestrationReportOptions,
): string {
  const { outputDir, module: mod } = options;
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const moduleName = mod ?? 'all';
  const filename = `orchestration-${moduleName}-${timestamp}.json`;
  const filePath = join(outputDir, filename);

  const serializable = {
    ...summary,
    phases: summary.phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      error: p.error,
      durationMs: p.durationMs,
    })),
    // Strip report content to avoid massive JSON
    reports: summary.reports?.map((r) => ({
      format: r.format,
      filename: r.filename,
    })),
  };

  writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  return filePath;
}

/**
 * Format a phase result as a single console line.
 */
function formatPhase(p: PhaseResult): string {
  const icons: Record<string, string> = {
    success: '✓',
    warn: '⚠',
    error: '✗',
    skipped: '○',
  };
  const icon = icons[p.status] ?? '?';
  const dur = p.durationMs > 0 ? ` (${p.durationMs}ms)` : '';
  const err = p.error ? ` — ${p.error}` : '';
  return `  ${icon} ${p.phase}${dur}${err}`;
}

/**
 * Print a human-readable console summary.
 */
export function printOrchestrationSummary(summary: OrchestrationSummary): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push('  ═══════════════════════════════════════');
  lines.push('  Orchestration Summary');
  lines.push('  ═══════════════════════════════════════');
  lines.push('');

  for (const p of summary.phases) {
    lines.push(formatPhase(p));
  }

  lines.push('');
  lines.push(`  Overall    : ${summary.overallStatus}`);
  lines.push(`  Modules    : ${summary.modules.join(', ') || '(none)'}`);
  lines.push(`  Duration   : ${summary.totalDurationMs}ms`);

  if (summary.executionMetrics) {
    const m = summary.executionMetrics;
    lines.push(`  Tests      : ${m.passed} passed, ${m.failed} failed, ${m.skipped} skipped`);
  }

  if (summary.healingResult) {
    const h = summary.healingResult;
    lines.push(`  Healing    : ${h.fixed.length} fixed, ${h.remaining.length} remaining (${h.iterations} iterations)`);
  }

  if (summary.reports) {
    lines.push(`  Reports    : ${summary.reports.map((r) => r.format).join(', ')}`);
  }

  if (summary.recommendation) {
    lines.push('');
    lines.push(`  → ${summary.recommendation}`);
  }

  lines.push('');

  return lines;
}
