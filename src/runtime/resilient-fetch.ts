/**
 * Resilient HTTP fetch with exponential backoff retry.
 * Framework-level utility — no Playwright dependency required.
 */

export interface AttemptRecord {
  attempt: number;
  status: number;
  url: string;
  method: string;
  latencyMs: number;
  error?: string;
}

export interface ResilientFetchOptions {
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request body (will be JSON-stringified if object) */
  body?: string | Record<string, unknown>;
  /** Request headers */
  headers?: Record<string, string>;
  /** Max retry count (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Per-request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** If true, throw on final failure; if false, return error result (default: false) */
  throwOnFailure?: boolean;
}

export interface ResilientFetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  attempts: AttemptRecord[];
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Make an HTTP request with automatic retry and exponential backoff.
 *
 * Retries on: network errors, 408, 429, 5xx.
 * Does NOT retry on: 4xx (except 408/429).
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {},
): Promise<ResilientFetchResult> {
  const {
    method = 'GET',
    body,
    headers = {},
    maxRetries = 3,
    baseDelayMs = 1000,
    timeoutMs = 10_000,
    throwOnFailure = false,
  } = options;

  const attempts: AttemptRecord[] = [];
  let lastStatus = 0;
  let lastBody: unknown = null;

  const requestHeaders: Record<string, string> = { ...headers };
  if (body && typeof body === 'object' && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  for (let i = 0; i <= maxRetries; i++) {
    const start = Date.now();

    try {
      const resp = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latency = Date.now() - start;
      lastStatus = resp.status;
      lastBody = await safeJson(resp);

      attempts.push({ attempt: i + 1, status: lastStatus, url, method, latencyMs: latency });

      if (resp.ok) {
        return { ok: true, status: lastStatus, data: lastBody, attempts };
      }

      if (isRetryable(lastStatus) && i < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, i);
        await sleep(delay);
        continue;
      }

      // Non-retryable error
      break;
    } catch (err) {
      const latency = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      attempts.push({ attempt: i + 1, status: 0, url, method, latencyMs: latency, error: errMsg });

      if (i < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, i);
        await sleep(delay);
        continue;
      }
      break;
    }
  }

  const result: ResilientFetchResult = { ok: false, status: lastStatus, data: lastBody, attempts };

  if (throwOnFailure) {
    const summary = attempts.map((a) => `[${a.attempt}] ${a.status || 'ERR'} ${a.latencyMs}ms`).join(', ');
    throw new Error(`resilientFetch failed: ${method} ${url} (${attempts.length} attempts): ${summary}`);
  }

  return result;
}

/**
 * Wait for a backend to become healthy by polling a health endpoint.
 */
export async function waitForBackend(
  baseUrl: string,
  options: { timeoutMs?: number; intervalMs?: number; healthPath?: string } = {},
): Promise<void> {
  const { timeoutMs = 30_000, intervalMs = 1_000, healthPath = '/health' } = options;
  const healthUrl = new URL(healthPath, baseUrl).href;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(3_000) });
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(intervalMs);
  }

  throw new Error(`Backend not ready: ${healthUrl} timed out after ${timeoutMs}ms`);
}
