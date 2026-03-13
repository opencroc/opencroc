/**
 * Log-driven API completion detection.
 *
 * Polls a backend log endpoint to verify that API requests have fully completed
 * (not just returned HTTP 200, but the backend has finished all processing).
 * This closes the gap between "HTTP response received" and "backend actually done".
 */

// ===== Types =====

export interface CandidateApiRequest {
  /** Backend-assigned request ID (if available) */
  requestId?: string;
  /** HTTP method */
  method: string;
  /** API path (e.g. /api/users) */
  path: string;
  /** Full URL */
  url: string;
}

export interface LogCompletionResult {
  /** Total candidates being tracked */
  candidateCount: number;
  /** Requests confirmed completed successfully */
  succeeded: CandidateApiRequest[];
  /** Requests confirmed completed with failure */
  failed: Array<{ request: CandidateApiRequest; reason: string }>;
  /** Requests that never got a completion log within timeout */
  timedOut: CandidateApiRequest[];
  /** Number of poll iterations performed */
  pollCount: number;
  /** Total elapsed ms */
  elapsedMs: number;
}

export interface LogEntry {
  /** Backend-assigned request ID */
  requestId?: string;
  /** HTTP method */
  method?: string;
  /** API path */
  apiPath?: string;
  /** Event phase: 'start' | 'end' */
  eventPhase?: string;
  /** Event status: 'success' | 'fail' */
  eventStatus?: string;
  /** HTTP status code */
  status?: number;
  /** Nested metadata (some backends put fields here) */
  meta?: Record<string, unknown>;
}

export interface LogPollerOptions {
  /** Function that fetches end-phase logs from the backend. Return parsed log entries. */
  fetchLogs: () => Promise<LogEntry[]>;
  /** Timeout in ms (default: 25000) */
  timeoutMs?: number;
  /** Initial poll delay in ms (default: 200) */
  initialDelayMs?: number;
  /** Max poll delay in ms (default: 2000) */
  maxDelayMs?: number;
}

// ===== Ignore list =====

const IGNORE_KEYWORDS = [
  '/health', '/metrics', '/heartbeat', '/ping', '/alive',
  '/beacon', '/track', '/analytics', '/poll', '/stream', '/sse',
];

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function shouldIgnore(path: string): boolean {
  const lower = path.toLowerCase();
  return IGNORE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ===== Candidate selection =====

export interface ApiResponseRecord {
  url: string;
  method: string;
  requestId?: string;
}

/**
 * Select candidate API requests from network-captured responses.
 * Deduplicates by requestId or method+path.
 */
export function selectCandidates(responses: ApiResponseRecord[], maxCount = 20): CandidateApiRequest[] {
  const unique = new Map<string, CandidateApiRequest>();

  for (const item of responses) {
    if (!item.url.includes('/api/')) continue;
    const path = extractPath(item.url);
    if (shouldIgnore(path)) continue;
    const method = item.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;

    const key = item.requestId ? `rid:${item.requestId}` : `mp:${method}:${path}`;
    if (!unique.has(key)) {
      unique.set(key, { requestId: item.requestId, method, path, url: item.url });
    }
  }

  return Array.from(unique.values()).slice(0, maxCount);
}

/**
 * Select candidates from start-phase log entries.
 */
export function selectCandidatesFromLogs(logs: LogEntry[], maxCount = 20): CandidateApiRequest[] {
  const unique = new Map<string, CandidateApiRequest>();

  for (const log of logs) {
    const phase = getField(log, 'eventPhase');
    if (phase !== 'start') continue;

    const method = getField(log, 'method').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;

    const rawPath = getField(log, 'apiPath') || getField(log, 'url');
    const path = extractPath(rawPath);
    if (!path.includes('/api/') || shouldIgnore(path)) continue;

    const requestId = getField(log, 'requestId') || undefined;
    const key = requestId ? `rid:${requestId}` : `mp:${method}:${path}`;
    if (!unique.has(key)) {
      unique.set(key, { requestId, method, path, url: rawPath });
    }
  }

  return Array.from(unique.values()).slice(0, maxCount);
}

/**
 * Merge multiple candidate lists, deduplicating by key.
 */
export function mergeCandidates(...groups: CandidateApiRequest[][]): CandidateApiRequest[] {
  const merged = new Map<string, CandidateApiRequest>();
  for (const group of groups) {
    for (const item of group) {
      const key = item.requestId ? `rid:${item.requestId}` : `mp:${item.method}:${item.path}`;
      if (!merged.has(key)) merged.set(key, item);
    }
  }
  return Array.from(merged.values()).slice(0, 30);
}

// ===== Log matching =====

function getField(log: LogEntry, field: string): string {
  const direct = (log as Record<string, unknown>)[field];
  if (direct != null) return String(direct);
  const meta = log.meta?.[field];
  if (meta != null) return String(meta);
  return '';
}

function matchLog(request: CandidateApiRequest, logs: LogEntry[]): LogEntry | undefined {
  if (request.requestId) {
    const byId = logs.find((l) => getField(l, 'requestId') === request.requestId);
    if (byId) return byId;
  }
  return logs.find((l) => {
    const method = getField(l, 'method').toUpperCase();
    const apiPath = getField(l, 'apiPath') || getField(l, 'url');
    return method === request.method && apiPath.includes(request.path);
  });
}

function inferStatus(log: LogEntry): 'success' | 'fail' {
  const eventStatus = getField(log, 'eventStatus').toLowerCase();
  if (eventStatus === 'success' || eventStatus === 'fail') return eventStatus as 'success' | 'fail';
  const status = Number(getField(log, 'status'));
  if (!Number.isNaN(status) && status >= 400) return 'fail';
  return 'success';
}

// ===== Core poller =====

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll backend logs until all candidate API requests have completion entries,
 * or the timeout is reached.
 *
 * @example
 * ```ts
 * const result = await waitForLogCompletion(candidates, {
 *   fetchLogs: async () => {
 *     const resp = await fetch(`${origin}/internal/test-logs?eventPhase=end&since=${since}`);
 *     const body = await resp.json();
 *     return body.data ?? [];
 *   },
 *   timeoutMs: 20_000,
 * });
 * ```
 */
export async function waitForLogCompletion(
  candidates: CandidateApiRequest[],
  options: LogPollerOptions,
): Promise<LogCompletionResult> {
  const {
    fetchLogs,
    timeoutMs = 25_000,
    initialDelayMs = 200,
    maxDelayMs = 2_000,
  } = options;

  const pending = [...candidates];
  const succeeded: CandidateApiRequest[] = [];
  const failed: LogCompletionResult['failed'] = [];
  const startedAt = Date.now();
  let pollCount = 0;

  while (pending.length > 0 && Date.now() - startedAt < timeoutMs) {
    const logs = await fetchLogs();
    pollCount++;

    for (let i = pending.length - 1; i >= 0; i--) {
      const candidate = pending[i];
      const log = matchLog(candidate, logs);
      if (!log) continue;

      if (inferStatus(log) === 'fail') {
        failed.push({ request: candidate, reason: 'LOG_COMPLETION_FAIL' });
      } else {
        succeeded.push(candidate);
      }
      pending.splice(i, 1);
    }

    if (pending.length === 0) break;

    // Progressive backoff: 200ms → 500ms → 1s → 2s
    const step = pollCount;
    const delay = step <= 1 ? initialDelayMs : step === 2 ? 500 : Math.min(maxDelayMs, 1000 * 2 ** (step - 3));
    await sleep(delay);
  }

  return {
    candidateCount: candidates.length,
    succeeded,
    failed,
    timedOut: pending,
    pollCount,
    elapsedMs: Date.now() - startedAt,
  };
}
