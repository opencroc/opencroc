import type { SelfHealingConfig, SelfHealingResult, FixOutcome } from '../types.js';

export type { SelfHealingResult, FixOutcome };

export interface SelfHealingLoop {
  run(testResultsDir: string): Promise<SelfHealingResult>;
}

/**
 * Categorize a test failure by heuristic rules.
 */
export function categorizeFailure(errorMessage: string): {
  category: string;
  confidence: number;
} {
  const msg = errorMessage.toLowerCase();

  if (/5\d{2}|internal server error/.test(msg))
    return { category: 'backend-5xx', confidence: 0.9 };
  if (/timeout|timed?\s*out/.test(msg))
    return { category: 'timeout', confidence: 0.8 };
  if (/404|not found/.test(msg))
    return { category: 'endpoint-not-found', confidence: 0.85 };
  if (/4[0-2]\d|validation|constraint/.test(msg))
    return { category: 'data-constraint', confidence: 0.75 };
  if (/econnrefused|enotfound|network/.test(msg))
    return { category: 'network', confidence: 0.9 };
  if (/selector|locator|element/.test(msg))
    return { category: 'frontend-render', confidence: 0.7 };
  if (/storage\s*state|auth|login/.test(msg))
    return { category: 'test-script', confidence: 0.8 };

  return { category: 'unknown', confidence: 0.5 };
}

/**
 * Attempt a config-only fix: validate and write corrected config JSON.
 */
async function attemptConfigFix(
  _testResultsDir: string,
  _mode: SelfHealingConfig['mode'],
): Promise<FixOutcome> {
  // TODO: Load module config → run autoFix validation → write corrected JSON
  // For now, return a no-op outcome
  return {
    success: false,
    scope: 'config-only',
    fixedItems: [],
    rolledBack: false,
  };
}

export function createSelfHealingLoop(config: SelfHealingConfig): SelfHealingLoop {
  return {
    async run(testResultsDir: string): Promise<SelfHealingResult> {
      const maxIterations = config.maxIterations || 3;
      const mode = config.mode || 'config-only';
      const fixed: string[] = [];
      const remaining: string[] = [];
      let iterations = 0;

      for (let i = 0; i < maxIterations; i++) {
        iterations = i + 1;

        const outcome = await attemptConfigFix(testResultsDir, mode);
        if (outcome.success) {
          fixed.push(...outcome.fixedItems);
        } else {
          remaining.push(`iteration-${i + 1}: no fix applied`);
        }

        // If all fixed, stop early
        if (outcome.success && outcome.fixedItems.length > 0) break;
      }

      return {
        iterations,
        fixed,
        remaining,
        totalTokensUsed: 0,
      };
    },
  };
}
