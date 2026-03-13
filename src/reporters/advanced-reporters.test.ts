import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyFailure,
  buildFailureSummary,
  aggregateLogCompletion,
  parseApiDomain,
  buildBackendChecklist,
  renderChecklistMarkdown,
} from './checklist-reporter.js';
import { buildWorkorders, renderWorkordersMarkdown } from './workorder-reporter.js';
import { TokenTracker, renderTokenReportMarkdown } from './token-reporter.js';
import type { TestResultRecord, LogCompletionSummary, BackendDomainItem } from '../types.js';

// ============================================================
// Fixtures
// ============================================================

function rec(title: string, status: TestResultRecord['status'], error?: string, lc?: TestResultRecord['logCompletion']): TestResultRecord {
  return { title, status, duration: 100, error, logCompletion: lc };
}

const RECORDS: TestResultRecord[] = [
  rec('test-pass', 'passed'),
  rec('test-5xx-users', 'failed', '[BACKEND_5XX] on https://api.dev/v1/users/123'),
  rec('test-5xx-roles', 'failed', '[BACKEND_5XX] on https://api.dev/v1/roles'),
  rec('test-5xx-users-2', 'failed', '[BACKEND_5XX] on https://api.dev/v1/users/456'),
  rec('test-mixed', 'failed', '[MIXED_5XX] at https://api.dev/v1/tenants'),
  rec('test-slow', 'failed', '[SLOW_API_FATAL] https://api.dev/v1/files'),
  rec('test-logfail', 'failed', '[LOG_COMPLETION_FAIL] some api'),
  rec('test-logtimeout', 'failed', '[LOG_COMPLETION_TIMEOUT] waiting'),
  rec('test-frontend', 'failed', 'page.waitForSelector timeout'),
  rec('test-other', 'failed', 'some random error'),
  rec('test-with-lc', 'passed', undefined, {
    candidateCount: 10,
    succeeded: Array.from({ length: 7 }, (_, i) => ({ method: 'GET', path: `/api/${i}` })),
    failed: [{ method: 'POST', path: '/api/fail' }],
    timedOut: [{ method: 'PUT', path: '/api/slow' }, { method: 'DELETE', path: '/api/hang' }],
  }),
  rec('test-with-lc-2', 'passed', undefined, {
    candidateCount: 5,
    succeeded: Array.from({ length: 3 }, (_, i) => ({ method: 'GET', path: `/api/b${i}` })),
    failed: [],
    timedOut: [{ method: 'PUT', path: '/api/slow' }],
  }),
];

// ============================================================
// Checklist Reporter
// ============================================================

describe('classifyFailure', () => {
  it('classifies backend 5xx', () => expect(classifyFailure('[BACKEND_5XX] error')).toBe('backend-5xx'));
  it('classifies mixed 5xx', () => expect(classifyFailure('[MIXED_5XX] error')).toBe('mixed-5xx'));
  it('classifies slow api', () => expect(classifyFailure('[SLOW_API_FATAL] timeout')).toBe('slow-api'));
  it('classifies log fail', () => expect(classifyFailure('[LOG_COMPLETION_FAIL]')).toBe('log-fail'));
  it('classifies log timeout', () => expect(classifyFailure('[LOG_COMPLETION_TIMEOUT]')).toBe('log-timeout'));
  it('classifies frontend load', () => expect(classifyFailure('waitForSelector timed out')).toBe('frontend-load'));
  it('classifies other', () => expect(classifyFailure('unknown')).toBe('other'));
  it('classifies undefined as other', () => expect(classifyFailure(undefined)).toBe('other'));
});

describe('buildFailureSummary', () => {
  it('counts each category correctly', () => {
    const s = buildFailureSummary(RECORDS);
    expect(s.totalFailed).toBe(9);
    expect(s.backend5xx).toBe(3);
    expect(s.mixed5xx).toBe(1);
    expect(s.slowApi).toBe(1);
    expect(s.logFail).toBe(1);
    expect(s.logTimeout).toBe(1);
    expect(s.frontendLoad).toBe(1);
    expect(s.other).toBe(1);
  });

  it('returns zeros for all-passing tests', () => {
    const s = buildFailureSummary([rec('ok', 'passed')]);
    expect(s.totalFailed).toBe(0);
    expect(s.backend5xx).toBe(0);
  });
});

describe('aggregateLogCompletion', () => {
  it('aggregates candidates across records', () => {
    const lc = aggregateLogCompletion(RECORDS);
    expect(lc.totalCandidates).toBe(15);
    expect(lc.succeeded).toBe(10);
    expect(lc.failed).toBe(1);
    expect(lc.timedOut).toBe(3);
  });

  it('computes match rate and effective rate', () => {
    const lc = aggregateLogCompletion(RECORDS);
    expect(lc.matchRate).toBeCloseTo(73.33, 1);
    expect(lc.effectiveRate).toBeCloseTo(66.67, 1);
  });

  it('builds timedOut top 5 with frequency', () => {
    const lc = aggregateLogCompletion(RECORDS);
    expect(lc.timedOutTop5[0].path).toBe('/api/slow');
    expect(lc.timedOutTop5[0].occurrences).toBe(2); // appears in both records
    expect(lc.timedOutTop5[1].path).toBe('/api/hang');
    expect(lc.timedOutTop5[1].occurrences).toBe(1);
  });

  it('returns zeros for records without log completion', () => {
    const lc = aggregateLogCompletion([rec('x', 'passed')]);
    expect(lc.totalCandidates).toBe(0);
    expect(lc.matchRate).toBe(0);
  });
});

describe('parseApiDomain', () => {
  it('extracts domain after /v1/', () => {
    expect(parseApiDomain('https://api.dev/v1/users/123')).toBe('users');
    expect(parseApiDomain('https://api.dev/v1/roles')).toBe('roles');
  });

  it('skips numeric segments', () => {
    expect(parseApiDomain('https://api.dev/v1/123/items')).toBe('items');
  });

  it('falls back to first segment when no /v1/', () => {
    expect(parseApiDomain('https://api.dev/users/123')).toBe('users');
  });

  it('returns null for invalid URLs', () => {
    expect(parseApiDomain('not a url')).toBeNull();
  });
});

describe('buildBackendChecklist', () => {
  it('groups 5xx failures by API domain', () => {
    const list = buildBackendChecklist(RECORDS);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const users = list.find(i => i.domain === 'users');
    expect(users).toBeDefined();
    expect(users!.tests).toHaveLength(2);
    expect(users!.endpoints.length).toBeGreaterThanOrEqual(1);

    const roles = list.find(i => i.domain === 'roles');
    expect(roles).toBeDefined();
  });

  it('sorts by test count descending', () => {
    const list = buildBackendChecklist(RECORDS);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].tests.length).toBeGreaterThanOrEqual(list[i].tests.length);
    }
  });

  it('ignores non-5xx failures', () => {
    const list = buildBackendChecklist([rec('slow', 'failed', '[SLOW_API_FATAL] http://api/v1/x')]);
    expect(list).toHaveLength(0);
  });
});

describe('renderChecklistMarkdown', () => {
  it('renders header and summary stats', () => {
    const md = renderChecklistMarkdown([], buildFailureSummary(RECORDS));
    expect(md).toContain('# Backend Fix Checklist');
    expect(md).toContain('Backend 5xx: 3');
    expect(md).toContain('No backend 5xx failures');
  });

  it('renders domain items', () => {
    const items: BackendDomainItem[] = [
      { domain: 'users', tests: ['test-a', 'test-b'], endpoints: ['https://api/v1/users'] },
    ];
    const md = renderChecklistMarkdown(items, buildFailureSummary(RECORDS));
    expect(md).toContain('## users');
    expect(md).toContain('test-a');
    expect(md).toContain('https://api/v1/users');
  });

  it('includes log summary when provided', () => {
    const logSummary = aggregateLogCompletion(RECORDS);
    const md = renderChecklistMarkdown([], buildFailureSummary(RECORDS), logSummary);
    expect(md).toContain('Log match rate:');
    expect(md).toContain('Effective success rate:');
  });

  it('renders timedOut top 5 table', () => {
    const logSummary = aggregateLogCompletion(RECORDS);
    const md = renderChecklistMarkdown([], buildFailureSummary(RECORDS), logSummary);
    expect(md).toContain('Timed-out APIs Top 5');
    expect(md).toContain('/api/slow');
  });
});

// ============================================================
// Workorder Reporter
// ============================================================

describe('buildWorkorders', () => {
  const summary = buildFailureSummary(RECORDS);
  const checklist = buildBackendChecklist(RECORDS);

  it('creates workorders from checklist items', () => {
    const wos = buildWorkorders({ checklist, summary });
    expect(wos.length).toBe(checklist.length);
    expect(wos[0].index).toBe(1);
  });

  it('assigns P0 for domains with ≥3 tests', () => {
    const bigItem: BackendDomainItem = { domain: 'big', tests: ['a', 'b', 'c'], endpoints: [] };
    const wos = buildWorkorders({ checklist: [bigItem], summary });
    expect(wos[0].priority).toBe('P0');
  });

  it('assigns P1 for 2 tests, P2 for 1', () => {
    const items: BackendDomainItem[] = [
      { domain: 'two', tests: ['a', 'b'], endpoints: [] },
      { domain: 'one', tests: ['a'], endpoints: [] },
    ];
    const wos = buildWorkorders({ checklist: items, summary });
    expect(wos[0].priority).toBe('P1');
    expect(wos[1].priority).toBe('P2');
  });

  it('auto-generates P0 log-rate workorder when threshold not met', () => {
    const logSummary: LogCompletionSummary = {
      totalCandidates: 10, succeeded: 5, failed: 1, timedOut: 4,
      matchRate: 60, effectiveRate: 50,
      timedOutTop5: [{ method: 'PUT', path: '/api/slow', occurrences: 3 }],
    };
    const wos = buildWorkorders({ checklist: [], summary, logSummary, logRateThreshold: 90 });
    expect(wos).toHaveLength(1);
    expect(wos[0].priority).toBe('P0');
    expect(wos[0].domain).toBe('Log Completion Standards');
  });

  it('skips log-rate workorder when rate is above threshold', () => {
    const logSummary: LogCompletionSummary = {
      totalCandidates: 10, succeeded: 9, failed: 1, timedOut: 0,
      matchRate: 100, effectiveRate: 90,
      timedOutTop5: [],
    };
    const wos = buildWorkorders({ checklist: [], summary, logSummary });
    expect(wos).toHaveLength(0);
  });

  it('each workorder has acceptance criteria', () => {
    const wos = buildWorkorders({ checklist, summary });
    for (const wo of wos) {
      expect(wo.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(wo.objective).toBeTruthy();
    }
  });
});

describe('renderWorkordersMarkdown', () => {
  it('renders header and summary', () => {
    const summary = buildFailureSummary(RECORDS);
    const md = renderWorkordersMarkdown([], summary);
    expect(md).toContain('# Backend Work Orders');
    expect(md).toContain('No backend work orders');
  });

  it('renders workorder items with priority', () => {
    const summary = buildFailureSummary(RECORDS);
    const checklist = buildBackendChecklist(RECORDS);
    const wos = buildWorkorders({ checklist, summary });
    const md = renderWorkordersMarkdown(wos, summary);
    expect(md).toContain('## Workorder 1');
    expect(md).toContain('Priority:');
    expect(md).toContain('Acceptance criteria:');
  });
});

// ============================================================
// Token Reporter
// ============================================================

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  it('records and summarizes entries', () => {
    tracker.record({
      category: 'analysis', model: 'gpt-4',
      promptTokens: 100, completionTokens: 50, latencyMs: 200, estimatedCost: 0.005,
    });
    tracker.record({
      category: 'codegen', model: 'gpt-4',
      promptTokens: 200, completionTokens: 100, latencyMs: 400, estimatedCost: 0.01,
    });

    const s = tracker.getSummary();
    expect(s.totalRequests).toBe(2);
    expect(s.totalTokens).toBe(450);
    expect(s.totalPromptTokens).toBe(300);
    expect(s.totalCompletionTokens).toBe(150);
    expect(s.avgLatencyMs).toBe(300);
    expect(s.totalEstimatedCost).toBeCloseTo(0.015);
  });

  it('aggregates by category', () => {
    tracker.record({ category: 'analysis', model: 'gpt-4', promptTokens: 50, completionTokens: 20, latencyMs: 100, estimatedCost: 0.002 });
    tracker.record({ category: 'analysis', model: 'gpt-4', promptTokens: 60, completionTokens: 30, latencyMs: 150, estimatedCost: 0.003 });

    const s = tracker.getSummary();
    expect(s.byCategory['analysis'].requests).toBe(2);
    expect(s.byCategory['analysis'].totalTokens).toBe(160);
  });

  it('aggregates by model', () => {
    tracker.record({ category: 'a', model: 'gpt-4', promptTokens: 100, completionTokens: 50, latencyMs: 100, estimatedCost: 0.01 });
    tracker.record({ category: 'a', model: 'zhipu-glm4', promptTokens: 200, completionTokens: 100, latencyMs: 150, estimatedCost: 0.005 });

    const s = tracker.getSummary();
    expect(Object.keys(s.byModel)).toHaveLength(2);
    expect(s.byModel['gpt-4'].totalTokens).toBe(150);
    expect(s.byModel['zhipu-glm4'].totalTokens).toBe(300);
  });

  it('tracks budget usage', () => {
    tracker.setBudget(1000);
    tracker.record({ category: 'a', model: 'gpt-4', promptTokens: 400, completionTokens: 200, latencyMs: 100, estimatedCost: 0.01 });

    const s = tracker.getSummary();
    expect(s.budgetUsedPercent).toBe(60);
    expect(s.budgetExceeded).toBe(false);
  });

  it('detects budget exceeded', () => {
    tracker.setBudget(100);
    tracker.record({ category: 'a', model: 'gpt-4', promptTokens: 80, completionTokens: 50, latencyMs: 100, estimatedCost: 0.01 });

    const s = tracker.getSummary();
    expect(s.budgetUsedPercent).toBe(130);
    expect(s.budgetExceeded).toBe(true);
  });

  it('returns null budget when not set', () => {
    tracker.record({ category: 'a', model: 'gpt-4', promptTokens: 100, completionTokens: 50, latencyMs: 100, estimatedCost: 0.01 });
    expect(tracker.getSummary().budgetUsedPercent).toBeNull();
  });

  it('resets entries', () => {
    tracker.record({ category: 'a', model: 'gpt-4', promptTokens: 100, completionTokens: 50, latencyMs: 100, estimatedCost: 0.01 });
    tracker.reset();
    expect(tracker.getSummary().totalRequests).toBe(0);
  });
});

describe('renderTokenReportMarkdown', () => {
  it('renders summary stats', () => {
    const tracker = new TokenTracker();
    tracker.setBudget(1000);
    tracker.record({ category: 'analysis', model: 'gpt-4', promptTokens: 100, completionTokens: 50, latencyMs: 200, estimatedCost: 0.005 });

    const md = renderTokenReportMarkdown(tracker.getSummary());
    expect(md).toContain('# AI Token Usage Report');
    expect(md).toContain('Total tokens:');
    expect(md).toContain('Budget used: 15%');
    expect(md).toContain('## By Category');
    expect(md).toContain('analysis');
    expect(md).toContain('## By Model');
    expect(md).toContain('gpt-4');
  });

  it('shows EXCEEDED for over-budget', () => {
    const tracker = new TokenTracker();
    tracker.setBudget(10);
    tracker.record({ category: 'x', model: 'y', promptTokens: 100, completionTokens: 50, latencyMs: 100, estimatedCost: 0.1 });

    const md = renderTokenReportMarkdown(tracker.getSummary());
    expect(md).toContain('**EXCEEDED**');
  });
});
