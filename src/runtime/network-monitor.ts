/**
 * Playwright network request/response monitor.
 * Attaches to a Page and records API calls, errors, and response times.
 */

export interface NetworkError {
  url: string;
  status: number;
  method: string;
  responseBody: string;
  requestPayload?: string;
  timestamp: string;
  pageUrl: string;
}

export interface ApiRecord {
  url: string;
  status: number;
  method: string;
  durationMs: number;
  timestamp: string;
  pageUrl: string;
}

export interface NetworkMonitorOptions {
  /** URL pattern to track (default: '/api/') */
  apiPattern?: string;
  /** Whether to capture response bodies for errors (default: true) */
  captureErrorBody?: boolean;
}

/** Minimal Playwright Page interface — avoids hard dependency on @playwright/test */
interface PlaywrightPage {
  url(): string;
  on(event: 'request', handler: (req: PlaywrightRequest) => void): void;
  on(event: 'response', handler: (res: PlaywrightResponse) => void): void;
}

interface PlaywrightRequest {
  url(): string;
  method(): string;
  postData(): string | null;
}

interface PlaywrightResponse {
  url(): string;
  status(): number;
  request(): PlaywrightRequest;
  text(): Promise<string>;
}

export class NetworkMonitor {
  private errors: NetworkError[] = [];
  private records: ApiRecord[] = [];
  private requestStarts = new WeakMap<PlaywrightRequest, number>();
  private readonly apiPattern: string;
  private readonly captureErrorBody: boolean;

  constructor(options: NetworkMonitorOptions = {}) {
    this.apiPattern = options.apiPattern ?? '/api/';
    this.captureErrorBody = options.captureErrorBody ?? true;
  }

  /**
   * Attach the monitor to a Playwright Page.
   * Call this once per page — typically in a test fixture or beforeEach.
   */
  attach(page: PlaywrightPage): void {
    page.on('request', (request) => {
      if (request.url().includes(this.apiPattern)) {
        this.requestStarts.set(request, Date.now());
      }
    });

    page.on('response', async (response) => {
      const request = response.request();
      const isApiCall = response.url().includes(this.apiPattern);
      const startedAt = this.requestStarts.get(request);

      if (isApiCall && startedAt) {
        this.records.push({
          url: response.url(),
          status: response.status(),
          method: request.method(),
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          pageUrl: page.url(),
        });
      }

      if (response.status() >= 400) {
        let body = '';
        if (this.captureErrorBody) {
          try {
            body = await response.text();
          } catch {
            body = 'Unable to read';
          }
        }

        this.errors.push({
          url: response.url(),
          status: response.status(),
          method: request.method(),
          responseBody: body,
          requestPayload: request.postData() ?? undefined,
          timestamp: new Date().toISOString(),
          pageUrl: page.url(),
        });
      }
    });
  }

  /** All captured API records. */
  getRecords(): ApiRecord[] {
    return [...this.records];
  }

  /** All captured network errors (status >= 400). */
  getErrors(): NetworkError[] {
    return [...this.errors];
  }

  /** API calls slower than the given threshold. */
  getSlowRequests(thresholdMs: number): ApiRecord[] {
    return this.records.filter((r) => r.durationMs >= thresholdMs);
  }

  /** 5xx server errors. */
  get5xxErrors(): NetworkError[] {
    return this.errors.filter((e) => e.status >= 500);
  }

  /** 4xx client errors. */
  get4xxErrors(): NetworkError[] {
    return this.errors.filter((e) => e.status >= 400 && e.status < 500);
  }

  /** Whether any network errors have been captured. */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /** Reset all captured data. */
  clear(): void {
    this.errors = [];
    this.records = [];
    this.requestStarts = new WeakMap();
  }
}
