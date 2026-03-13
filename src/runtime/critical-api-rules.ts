/**
 * Critical API rules engine.
 *
 * Define per-endpoint validation rules with performance thresholds and
 * behavior flags. Evaluate captured API records against rules to surface
 * violations (slow responses, unexpected empty data, fatal timeouts).
 */

// ===== Types =====

export interface CriticalApiRule {
  /** Route path this rule applies to (e.g. '/users/list') */
  routePath: string;
  /** Human-readable name */
  name: string;
  /** URL substring to match against captured API URLs */
  urlIncludes: string;
  /** HTTP method filter (optional; matches all if omitted) */
  method?: string;
  /** Whether an empty/null response body is acceptable (default: false) */
  allowEmpty?: boolean;
  /** Response time warning threshold in ms */
  warnMs?: number;
  /** Response time fatal threshold in ms */
  fatalMs?: number;
}

export interface ApiRuleViolation {
  rule: CriticalApiRule;
  /** 'warn' for exceeded warnMs, 'fatal' for exceeded fatalMs, 'empty' for unexpected empty response */
  severity: 'warn' | 'fatal' | 'empty';
  /** Actual duration in ms (for timing violations) */
  actualMs?: number;
  /** Description of the violation */
  message: string;
}

export interface ApiRecordForRules {
  url: string;
  method: string;
  durationMs: number;
  /** Response body (for empty checks) */
  responseBody?: string | null;
}

// ===== Rules registry =====

/**
 * Create a rules engine that evaluates API records against a set of critical rules.
 */
export function createRulesEngine(rules: CriticalApiRule[]) {
  return {
    /** Get all rules. */
    getRules(): CriticalApiRule[] {
      return [...rules];
    },

    /** Get rules matching a specific route path. */
    getRulesByRoute(routePath: string): CriticalApiRule[] {
      return rules.filter((r) => r.routePath === routePath);
    },

    /** Get rules matching a specific URL. */
    getRulesByUrl(url: string): CriticalApiRule[] {
      return rules.filter((r) => url.includes(r.urlIncludes));
    },

    /**
     * Evaluate a single API record against all matching rules.
     * Returns violations (empty array if all rules pass).
     */
    evaluate(record: ApiRecordForRules): ApiRuleViolation[] {
      const violations: ApiRuleViolation[] = [];
      const matchingRules = rules.filter((r) => {
        if (!record.url.includes(r.urlIncludes)) return false;
        if (r.method && r.method.toUpperCase() !== record.method.toUpperCase()) return false;
        return true;
      });

      for (const rule of matchingRules) {
        // Fatal threshold check
        if (rule.fatalMs && record.durationMs >= rule.fatalMs) {
          violations.push({
            rule,
            severity: 'fatal',
            actualMs: record.durationMs,
            message: `${rule.name}: ${record.durationMs}ms exceeds fatal threshold ${rule.fatalMs}ms`,
          });
        }
        // Warn threshold check (only if not already fatal)
        else if (rule.warnMs && record.durationMs >= rule.warnMs) {
          violations.push({
            rule,
            severity: 'warn',
            actualMs: record.durationMs,
            message: `${rule.name}: ${record.durationMs}ms exceeds warn threshold ${rule.warnMs}ms`,
          });
        }

        // Empty response check
        if (!rule.allowEmpty) {
          const body = record.responseBody;
          if (body === null || body === undefined || body === '' || body === '{}' || body === '[]' || body === 'null') {
            violations.push({
              rule,
              severity: 'empty',
              message: `${rule.name}: response body is empty but allowEmpty=false`,
            });
          }
        }
      }

      return violations;
    },

    /**
     * Evaluate multiple API records and return all violations.
     */
    evaluateAll(records: ApiRecordForRules[]): ApiRuleViolation[] {
      return records.flatMap((r) => this.evaluate(r));
    },

    /**
     * Summary: group violations by severity.
     */
    summarize(violations: ApiRuleViolation[]): { fatal: number; warn: number; empty: number } {
      return {
        fatal: violations.filter((v) => v.severity === 'fatal').length,
        warn: violations.filter((v) => v.severity === 'warn').length,
        empty: violations.filter((v) => v.severity === 'empty').length,
      };
    },
  };
}
