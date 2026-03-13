import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resilientFetch, waitForBackend } from './resilient-fetch.js';
import { NetworkMonitor } from './network-monitor.js';
import {
  extractParamNames,
  extractParamsFromHref,
  buildPath,
  extractIdFromText,
  resolveFromSeedData,
} from './dynamic-route-resolver.js';

// ============================================================
// resilient-fetch
// ============================================================

describe('resilientFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok on successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    }));

    const result = await resilientFetch('http://localhost/api/test');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ data: 'ok' });
    expect(result.attempts).toHaveLength(1);
  });

  it('retries on 500 and succeeds', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });

    vi.stubGlobal('fetch', mockFetch);

    const result = await resilientFetch('http://localhost/api', {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  it('does not retry on 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'bad request' }),
    }));

    const result = await resilientFetch('http://localhost/api', {
      maxRetries: 3,
      baseDelayMs: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.attempts).toHaveLength(1);
  });

  it('retries on network error', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    vi.stubGlobal('fetch', mockFetch);

    const result = await resilientFetch('http://localhost/api', {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].error).toContain('ECONNREFUSED');
  });

  it('throws when throwOnFailure is true and all retries exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    await expect(
      resilientFetch('http://localhost/api', {
        maxRetries: 1,
        baseDelayMs: 10,
        throwOnFailure: true,
      }),
    ).rejects.toThrow('resilientFetch failed');
  });

  it('sends POST with JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 1 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await resilientFetch('http://localhost/api/items', {
      method: 'POST',
      body: { name: 'test' },
    });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/api/items',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"test"}',
      }),
    );
  });
});

describe('waitForBackend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when health endpoint returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await expect(
      waitForBackend('http://localhost:3000', { timeoutMs: 5000, intervalMs: 50 }),
    ).resolves.toBeUndefined();
  });

  it('throws on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      waitForBackend('http://localhost:3000', { timeoutMs: 200, intervalMs: 50 }),
    ).rejects.toThrow('Backend not ready');
  });
});

// ============================================================
// network-monitor
// ============================================================

describe('NetworkMonitor', () => {
  function createMockPage() {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    return {
      url: () => 'http://localhost/test-page',
      on(event: string, handler: (...args: unknown[]) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      emit(event: string, ...args: unknown[]) {
        for (const h of handlers[event] ?? []) h(...args);
      },
    };
  }

  it('records API calls and detects errors', async () => {
    const monitor = new NetworkMonitor({ apiPattern: '/api/' });
    const page = createMockPage();
    monitor.attach(page as never);

    const request = {
      url: () => 'http://localhost/api/users',
      method: () => 'GET',
      postData: () => null,
    };

    // Simulate request
    page.emit('request', request);

    // Simulate successful response
    const okResponse = {
      url: () => 'http://localhost/api/users',
      status: () => 200,
      request: () => request,
      text: () => Promise.resolve('ok'),
    };
    await page.emit('response', okResponse);

    expect(monitor.getRecords()).toHaveLength(1);
    expect(monitor.getErrors()).toHaveLength(0);
    expect(monitor.hasErrors()).toBe(false);
  });

  it('captures error responses', async () => {
    const monitor = new NetworkMonitor();
    const page = createMockPage();
    monitor.attach(page as never);

    const request = {
      url: () => 'http://localhost/api/fail',
      method: () => 'POST',
      postData: () => '{"bad":"data"}',
    };
    page.emit('request', request);

    const errResponse = {
      url: () => 'http://localhost/api/fail',
      status: () => 500,
      request: () => request,
      text: () => Promise.resolve('Internal Server Error'),
    };
    page.emit('response', errResponse);

    // Allow async handler to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(monitor.hasErrors()).toBe(true);
    expect(monitor.get5xxErrors()).toHaveLength(1);
    expect(monitor.get4xxErrors()).toHaveLength(0);
  });

  it('filters slow requests', () => {
    const monitor = new NetworkMonitor();
    const page = createMockPage();
    monitor.attach(page as never);

    // Manually inject records for testing
    (monitor as unknown as { records: unknown[] }).records.push(
      { url: '/api/fast', status: 200, method: 'GET', durationMs: 100, timestamp: '', pageUrl: '' },
      { url: '/api/slow', status: 200, method: 'GET', durationMs: 5000, timestamp: '', pageUrl: '' },
    );

    expect(monitor.getSlowRequests(3000)).toHaveLength(1);
    expect(monitor.getSlowRequests(3000)[0].url).toBe('/api/slow');
  });

  it('clears captured data', () => {
    const monitor = new NetworkMonitor();
    (monitor as unknown as { records: unknown[]; errors: unknown[] }).records.push({} as never);
    (monitor as unknown as { records: unknown[]; errors: unknown[] }).errors.push({} as never);

    monitor.clear();

    expect(monitor.getRecords()).toHaveLength(0);
    expect(monitor.getErrors()).toHaveLength(0);
  });
});

// ============================================================
// dynamic-route-resolver
// ============================================================

describe('extractParamNames', () => {
  it('extracts single param', () => {
    expect(extractParamNames('/users/:id')).toEqual(['id']);
  });

  it('extracts multiple params', () => {
    expect(extractParamNames('/users/:userId/posts/:postId')).toEqual(['userId', 'postId']);
  });

  it('returns empty for static path', () => {
    expect(extractParamNames('/users/list')).toEqual([]);
  });
});

describe('extractParamsFromHref', () => {
  it('extracts params from matching href', () => {
    const result = extractParamsFromHref('/users/:id/detail', '/users/42/detail');
    expect(result).toEqual({ id: '42' });
  });

  it('extracts multiple params', () => {
    const result = extractParamsFromHref('/kb/:kbId/doc/:docId', '/kb/abc-123/doc/456');
    expect(result).toEqual({ kbId: 'abc-123', docId: '456' });
  });

  it('returns null for non-matching href', () => {
    const result = extractParamsFromHref('/users/:id/detail', '/posts/42');
    expect(result).toBeNull();
  });

  it('returns null when href is too short', () => {
    const result = extractParamsFromHref('/a/:id/b/:rid', '/a/1');
    expect(result).toBeNull();
  });
});

describe('buildPath', () => {
  it('replaces single param', () => {
    expect(buildPath('/users/:id', { id: '42' })).toBe('/users/42');
  });

  it('replaces multiple params', () => {
    expect(buildPath('/kb/:kbId/doc/:docId', { kbId: 'abc', docId: '7' })).toBe('/kb/abc/doc/7');
  });
});

describe('extractIdFromText', () => {
  it('extracts numeric ID', () => {
    expect(extractIdFromText('Row ID: 12345')).toBe('12345');
  });

  it('extracts UUID', () => {
    expect(extractIdFromText('ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('returns null for no match', () => {
    expect(extractIdFromText('no ids here')).toBeNull();
  });
});

describe('resolveFromSeedData', () => {
  const seedData = {
    _users_id: { id: '42' },
    custom_key: { kbId: 'abc', docId: '7' },
  };

  it('resolves using normalized key', () => {
    const result = resolveFromSeedData('/users/:id', seedData);
    expect(result).not.toBeNull();
    expect(result!.resolvedPath).toBe('/users/42');
    expect(result!.resolveMethod).toBe('seed-data');
  });

  it('resolves using explicit route key', () => {
    const result = resolveFromSeedData('/kb/:kbId/doc/:docId', seedData, 'custom_key');
    expect(result).not.toBeNull();
    expect(result!.resolvedPath).toBe('/kb/abc/doc/7');
  });

  it('returns null when key not found', () => {
    const result = resolveFromSeedData('/missing/:id', seedData);
    expect(result).toBeNull();
  });
});
