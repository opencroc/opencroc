/**
 * Workorder Reporter — auto-generates prioritized backend work orders.
 *
 * Priority rules:
 *   - P0: ≥3 affected tests OR log completion rate < 90%
 *   - P1: 2 affected tests
 *   - P2: 1 affected test
 *
 * Each workorder includes objective, affected scope, and acceptance criteria.
 */

import type {
  BackendDomainItem,
  FailureSummary,
  LogCompletionSummary,
  WorkorderItem,
} from '../types.js';

// ===== Priority assignment =====

function assignPriority(item: BackendDomainItem, isLogRate: boolean): 'P0' | 'P1' | 'P2' {
  if (isLogRate) return 'P0';
  if (item.tests.length >= 3) return 'P0';
  if (item.tests.length === 2) return 'P1';
  return 'P2';
}

// ===== Workorder builder =====

export interface BuildWorkordersOptions {
  checklist: BackendDomainItem[];
  summary: FailureSummary;
  logSummary?: LogCompletionSummary;
  logRateThreshold?: number;
}

export function buildWorkorders(opts: BuildWorkordersOptions): WorkorderItem[] {
  const { checklist, logSummary, logRateThreshold = 90 } = opts;
  const result: WorkorderItem[] = [];
  let idx = 1;

  // Auto P0 workorder if log completion rate is below threshold
  if (logSummary && logSummary.totalCandidates > 0 && logSummary.matchRate < logRateThreshold) {
    const logItem: BackendDomainItem = {
      domain: 'Log Completion Standards',
      tests: logSummary.timedOutTop5.map(t => `${t.method} ${t.path} (×${t.occurrences})`),
      endpoints: logSummary.timedOutTop5.map(t => t.path),
    };
    result.push({
      index: idx++,
      domain: logItem.domain,
      priority: 'P0',
      tests: logItem.tests,
      endpoints: logItem.endpoints,
      objective: 'Add missing end-phase structured logs for timed-out APIs',
      acceptanceCriteria: [
        `Log completion match rate ≥ ${logRateThreshold}%`,
        'TimedOut API count drops to 0 or only SSE/long-polling endpoints remain',
      ],
    });
  }

  // Standard workorders from checklist
  for (const item of checklist) {
    const priority = assignPriority(item, false);
    result.push({
      index: idx++,
      domain: item.domain,
      priority,
      tests: item.tests,
      endpoints: item.endpoints,
      objective: 'Fix 500 errors and return a valid business response',
      acceptanceCriteria: [
        'HTTP status returns 2xx for affected endpoints',
        'No [BACKEND_5XX] errors in corresponding page traversal',
        'All covered tests pass',
      ],
    });
  }

  return result;
}

// ===== Markdown renderer =====

export function renderWorkordersMarkdown(
  workorders: WorkorderItem[],
  summary: FailureSummary,
  logSummary?: LogCompletionSummary,
): string {
  const lines: string[] = [
    '# Backend Work Orders',
    '',
  ];

  if (logSummary) {
    lines.push(
      `- Log match rate: ${logSummary.matchRate.toFixed(2)}%`,
      `- Effective success rate: ${logSummary.effectiveRate.toFixed(2)}%`,
    );
  }
  lines.push(
    `- Total failed: ${summary.totalFailed}`,
    `- Backend 5xx: ${summary.backend5xx}`,
    `- Mixed 5xx: ${summary.mixed5xx}`,
    `- Slow API: ${summary.slowApi}`,
    `- Log fail: ${summary.logFail}`,
    `- Log timeout: ${summary.logTimeout}`,
    `- Frontend load: ${summary.frontendLoad}`,
    `- Other: ${summary.other}`,
    '',
  );

  if (workorders.length === 0) {
    lines.push('No backend work orders this run.');
    return lines.join('\n') + '\n';
  }

  for (const wo of workorders) {
    lines.push(
      `## Workorder ${wo.index} - ${wo.domain}`,
      '',
      `- Priority: ${wo.priority}`,
      `- Affected tests: ${wo.tests.length}`,
      '- Scope:',
    );
    for (const t of wo.tests) lines.push(`  - ${t}`);
    if (wo.endpoints.length > 0) {
      lines.push('- Endpoints:');
      for (const e of wo.endpoints) lines.push(`  - ${e}`);
    }
    lines.push(`- Objective: ${wo.objective}`);
    lines.push('- Acceptance criteria:');
    for (const c of wo.acceptanceCriteria) lines.push(`  - ${c}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}
