/**
 * Checklist Reporter — generates backend fix checklists from test results.
 *
 * Groups failures by API domain, lists affected tests and endpoints,
 * and produces both structured data and Markdown output.
 */

import type {
  TestResultRecord,
  FailureCategory,
  FailureSummary,
  BackendDomainItem,
  LogCompletionSummary,
} from '../types.js';

// ===== Failure classification =====

export function classifyFailure(error?: string): FailureCategory {
  if (!error) return 'other';
  if (error.includes('[BACKEND_5XX]')) return 'backend-5xx';
  if (error.includes('[MIXED_5XX]')) return 'mixed-5xx';
  if (error.includes('[SLOW_API_FATAL]')) return 'slow-api';
  if (error.includes('[LOG_COMPLETION_FAIL]')) return 'log-fail';
  if (error.includes('[LOG_COMPLETION_TIMEOUT]')) return 'log-timeout';
  if (/waitForSelector|toHaveURL|Timeout/i.test(error)) return 'frontend-load';
  return 'other';
}

// ===== Failure summary =====

export function buildFailureSummary(records: TestResultRecord[]): FailureSummary {
  const failed = records.filter(r => r.status === 'failed');
  const cats = failed.map(r => classifyFailure(r.error));
  return {
    totalFailed: failed.length,
    backend5xx: cats.filter(c => c === 'backend-5xx').length,
    mixed5xx: cats.filter(c => c === 'mixed-5xx').length,
    slowApi: cats.filter(c => c === 'slow-api').length,
    logFail: cats.filter(c => c === 'log-fail').length,
    logTimeout: cats.filter(c => c === 'log-timeout').length,
    frontendLoad: cats.filter(c => c === 'frontend-load').length,
    other: cats.filter(c => c === 'other').length,
  };
}

// ===== Log completion aggregation =====

export function aggregateLogCompletion(records: TestResultRecord[]): LogCompletionSummary {
  let totalCandidates = 0;
  let succeeded = 0;
  let failed = 0;
  let timedOut = 0;
  const timedOutFreq = new Map<string, { method: string; path: string; count: number }>();

  for (const r of records) {
    const lc = r.logCompletion;
    if (!lc || lc.candidateCount === 0) continue;

    totalCandidates += lc.candidateCount;
    succeeded += lc.succeeded.length;
    failed += lc.failed.length;
    timedOut += lc.timedOut.length;

    for (const item of lc.timedOut) {
      const key = `${item.method}:${item.path}`;
      const existing = timedOutFreq.get(key);
      if (existing) existing.count += 1;
      else timedOutFreq.set(key, { method: item.method, path: item.path, count: 1 });
    }
  }

  const timedOutTop5 = Array.from(timedOutFreq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(t => ({ method: t.method, path: t.path, occurrences: t.count }));

  const matchRate = totalCandidates > 0 ? (succeeded + failed) / totalCandidates * 100 : 0;
  const effectiveRate = totalCandidates > 0 ? succeeded / totalCandidates * 100 : 0;

  return { totalCandidates, succeeded, failed, timedOut, matchRate, effectiveRate, timedOutTop5 };
}

// ===== URL extraction helpers =====

function extractUrls(error?: string): string[] {
  if (!error) return [];
  const matched = error.match(/https?:\/\/[^\s\n]+/g);
  return matched ? Array.from(new Set(matched)) : [];
}

export function parseApiDomain(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname.split('/').filter(Boolean);
    const v1Index = segments.findIndex(s => s === 'v1');
    if (v1Index === -1 || v1Index + 1 >= segments.length) return segments[0] || null;
    const afterV1 = segments.slice(v1Index + 1);
    if (afterV1.length === 0) return null;
    const first = afterV1[0];
    if (/^\d+$/.test(first) && afterV1.length > 1) return afterV1[1];
    return first;
  } catch {
    return null;
  }
}

// ===== Backend checklist =====

export function buildBackendChecklist(records: TestResultRecord[]): BackendDomainItem[] {
  const domainMap = new Map<string, { tests: Set<string>; endpoints: Set<string> }>();
  const failed = records.filter(r => r.status === 'failed');

  for (const item of failed) {
    const cat = classifyFailure(item.error);
    if (cat !== 'backend-5xx' && cat !== 'mixed-5xx') continue;
    const urls = extractUrls(item.error);
    for (const url of urls) {
      const domain = parseApiDomain(url);
      if (!domain) continue;
      const current = domainMap.get(domain) ?? { tests: new Set<string>(), endpoints: new Set<string>() };
      current.tests.add(item.title);
      current.endpoints.add(url);
      domainMap.set(domain, current);
    }
  }

  return Array.from(domainMap.entries())
    .map(([domain, v]) => ({
      domain,
      tests: Array.from(v.tests).sort(),
      endpoints: Array.from(v.endpoints).sort(),
    }))
    .sort((a, b) => b.tests.length - a.tests.length || a.domain.localeCompare(b.domain));
}

// ===== Markdown renderer =====

export function renderChecklistMarkdown(
  items: BackendDomainItem[],
  summary: FailureSummary,
  logSummary?: LogCompletionSummary,
): string {
  const lines: string[] = [
    '# Backend Fix Checklist',
    '',
  ];

  if (logSummary) {
    lines.push(
      `- Log match rate: ${logSummary.matchRate.toFixed(2)}% (candidates=${logSummary.totalCandidates}, succeeded=${logSummary.succeeded}, failed=${logSummary.failed}, timedOut=${logSummary.timedOut})`,
      `- Effective success rate: ${logSummary.effectiveRate.toFixed(2)}%`,
    );
  }
  lines.push(
    `- Backend 5xx: ${summary.backend5xx}`,
    `- Mixed 5xx: ${summary.mixed5xx}`,
    `- Slow API: ${summary.slowApi}`,
    `- Log fail: ${summary.logFail}`,
    `- Log timeout: ${summary.logTimeout}`,
    `- Frontend load: ${summary.frontendLoad}`,
    `- Other: ${summary.other}`,
    '',
  );

  if (logSummary && logSummary.timedOutTop5.length > 0) {
    lines.push('### Timed-out APIs Top 5', '', '| # | Method | Path | Occurrences |', '|---|--------|------|-------------|');
    logSummary.timedOutTop5.forEach((t, i) => {
      lines.push(`| ${i + 1} | ${t.method} | ${t.path} | ${t.occurrences} |`);
    });
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('No backend 5xx failures this run.');
    return lines.join('\n') + '\n';
  }

  for (const item of items) {
    lines.push(
      `## ${item.domain}`,
      '',
      `- Failed tests: ${item.tests.length}`,
      '- Affected tests:',
    );
    for (const t of item.tests) lines.push(`  - ${t}`);
    lines.push('- Failed endpoints:');
    for (const e of item.endpoints) lines.push(`  - ${e}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}
