import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectCandidates,
  selectCandidatesFromLogs,
  mergeCandidates,
  waitForLogCompletion,
} from './log-completion-waiter.js';
import type { LogEntry } from './log-completion-waiter.js';
import { createRulesEngine } from './critical-api-rules.js';
import type { CriticalApiRule } from './critical-api-rules.js';

// ============================================================
// log-completion-waiter
// ============================================================

describe('selectCandidates', () => {
  it('selects API requests and deduplicates by method+path', () => {
    const responses = [
      { url: 'http://localhost/api/users', method: 'GET' },
      { url: 'http://localhost/api/users', method: 'GET' },
      { url: 'http://localhost/api/orders', method: 'POST' },
    ];
    const result = selectCandidates(responses);
    expect(result).toHaveLength(2);
  });

  it('ignores health/metrics endpoints', () => {
    const responses = [
      { url: 'http://localhost/api/health', method: 'GET' },
      { url: 'http://localhost/api/metrics', method: 'GET' },
      { url: 'http://localhost/api/users', method: 'GET' },
    ];
    const result = selectCandidates(responses);
    expect(result).toHaveLength(1);
    expect(result[0].path).toContain('/api/users');
  });

  it('ignores non-API URLs', () => {
    const responses = [
      { url: 'http://localhost/static/bundle.js', method: 'GET' },
    ];
    expect(selectCandidates(responses)).toHaveLength(0);
  });

  it('deduplicates by requestId when available', () => {
    const responses = [
      { url: 'http://localhost/api/users', method: 'GET', requestId: 'req-1' },
      { url: 'http://localhost/api/users', method: 'GET', requestId: 'req-1' },
    ];
    expect(selectCandidates(responses)).toHaveLength(1);
  });

  it('respects maxCount limit', () => {
    const responses = Array.from({ length: 30 }, (_, i) => ({
      url: `http://localhost/api/item-${i}`,
      method: 'GET',
    }));
    expect(selectCandidates(responses, 5)).toHaveLength(5);
  });
});

describe('selectCandidatesFromLogs', () => {
  it('selects from start-phase logs', () => {
    const logs: LogEntry[] = [
      { eventPhase: 'start', method: 'POST', apiPath: '/api/orders' },
      { eventPhase: 'end', method: 'POST', apiPath: '/api/orders' },
      { eventPhase: 'start', method: 'GET', apiPath: '/api/users' },
    ];
    const result = selectCandidatesFromLogs(logs);
    expect(result).toHaveLength(2);
  });

  it('reads fields from meta if top-level missing', () => {
    const logs: LogEntry[] = [
      { meta: { eventPhase: 'start', method: 'GET', apiPath: '/api/data', url: '/api/data' } },
    ];
    expect(selectCandidatesFromLogs(logs)).toHaveLength(1);
  });
});

describe('mergeCandidates', () => {
  it('merges and deduplicates', () => {
    const group1 = [{ method: 'GET', path: '/api/users', url: '/api/users' }];
    const group2 = [
      { method: 'GET', path: '/api/users', url: '/api/users' },
      { method: 'POST', path: '/api/orders', url: '/api/orders' },
    ];
    expect(mergeCandidates(group1, group2)).toHaveLength(2);
  });
});

describe('waitForLogCompletion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves immediately when all logs match', async () => {
    const candidates = [
      { method: 'GET', path: '/api/users', url: '/api/users' },
    ];

    const fetchLogs = vi.fn().mockResolvedValue([
      { method: 'GET', apiPath: '/api/users', eventPhase: 'end', eventStatus: 'success' },
    ]);

    const result = await waitForLogCompletion(candidates, {
      fetchLogs,
      timeoutMs: 5000,
    });

    expect(result.succeeded).toHaveLength(1);
    expect(result.timedOut).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.pollCount).toBe(1);
  });

  it('reports failed logs', async () => {
    const candidates = [
      { method: 'POST', path: '/api/orders', url: '/api/orders' },
    ];

    const fetchLogs = vi.fn().mockResolvedValue([
      { method: 'POST', apiPath: '/api/orders', eventPhase: 'end', eventStatus: 'fail' },
    ]);

    const result = await waitForLogCompletion(candidates, {
      fetchLogs,
      timeoutMs: 5000,
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toBe('LOG_COMPLETION_FAIL');
  });

  it('times out on missing logs', async () => {
    const candidates = [
      { method: 'GET', path: '/api/missing', url: '/api/missing' },
    ];

    const fetchLogs = vi.fn().mockResolvedValue([]);

    const result = await waitForLogCompletion(candidates, {
      fetchLogs,
      timeoutMs: 300,
      initialDelayMs: 50,
      maxDelayMs: 100,
    });

    expect(result.timedOut).toHaveLength(1);
    expect(result.pollCount).toBeGreaterThan(0);
  });

  it('matches by requestId', async () => {
    const candidates = [
      { requestId: 'req-42', method: 'GET', path: '/api/data', url: '/api/data' },
    ];

    const fetchLogs = vi.fn().mockResolvedValue([
      { requestId: 'req-42', eventStatus: 'success' },
    ]);

    const result = await waitForLogCompletion(candidates, { fetchLogs, timeoutMs: 5000 });
    expect(result.succeeded).toHaveLength(1);
  });

  it('infers failure from HTTP status >= 400 in meta', async () => {
    const candidates = [
      { method: 'GET', path: '/api/fail', url: '/api/fail' },
    ];

    const fetchLogs = vi.fn().mockResolvedValue([
      { method: 'GET', apiPath: '/api/fail', meta: { status: 500 } },
    ]);

    const result = await waitForLogCompletion(candidates, { fetchLogs, timeoutMs: 5000 });
    expect(result.failed).toHaveLength(1);
  });
});

// ============================================================
// critical-api-rules
// ============================================================

describe('createRulesEngine', () => {
  const rules: CriticalApiRule[] = [
    {
      routePath: '/users',
      name: 'User List API',
      urlIncludes: '/api/users',
      method: 'GET',
      allowEmpty: false,
      warnMs: 3000,
      fatalMs: 8000,
    },
    {
      routePath: '/orders',
      name: 'Create Order',
      urlIncludes: '/api/orders',
      method: 'POST',
      allowEmpty: true,
      warnMs: 5000,
      fatalMs: 15000,
    },
  ];

  it('gets rules by route', () => {
    const engine = createRulesEngine(rules);
    expect(engine.getRulesByRoute('/users')).toHaveLength(1);
    expect(engine.getRulesByRoute('/missing')).toHaveLength(0);
  });

  it('gets rules by URL', () => {
    const engine = createRulesEngine(rules);
    expect(engine.getRulesByUrl('http://localhost/api/users?page=1')).toHaveLength(1);
  });

  it('detects warn threshold violation', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluate({
      url: 'http://localhost/api/users',
      method: 'GET',
      durationMs: 4000,
      responseBody: '{"data":[]}',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('warn');
    expect(violations[0].actualMs).toBe(4000);
  });

  it('detects fatal threshold violation (overrides warn)', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluate({
      url: 'http://localhost/api/users',
      method: 'GET',
      durationMs: 9000,
      responseBody: '{"data":[]}',
    });
    // Fatal only, not both warn + fatal
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('fatal');
  });

  it('detects empty response body', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluate({
      url: 'http://localhost/api/users',
      method: 'GET',
      durationMs: 100,
      responseBody: '',
    });
    expect(violations.some((v) => v.severity === 'empty')).toBe(true);
  });

  it('allows empty response when allowEmpty is true', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluate({
      url: 'http://localhost/api/orders',
      method: 'POST',
      durationMs: 100,
      responseBody: '',
    });
    expect(violations.some((v) => v.severity === 'empty')).toBe(false);
  });

  it('does not match wrong HTTP method', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluate({
      url: 'http://localhost/api/users',
      method: 'DELETE',
      durationMs: 50000,
      responseBody: 'ok',
    });
    expect(violations).toHaveLength(0);
  });

  it('evaluateAll returns violations for multiple records', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluateAll([
      { url: 'http://localhost/api/users', method: 'GET', durationMs: 9000, responseBody: 'ok' },
      { url: 'http://localhost/api/orders', method: 'POST', durationMs: 100, responseBody: 'ok' },
    ]);
    expect(violations.some((v) => v.severity === 'fatal')).toBe(true);
  });

  it('summarize counts violations by severity', () => {
    const engine = createRulesEngine(rules);
    const violations = engine.evaluateAll([
      { url: 'http://localhost/api/users', method: 'GET', durationMs: 4000, responseBody: '' },
    ]);
    const summary = engine.summarize(violations);
    expect(summary.warn).toBe(1);
    expect(summary.empty).toBe(1);
    expect(summary.fatal).toBe(0);
  });
});
