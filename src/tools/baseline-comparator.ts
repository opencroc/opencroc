/**
 * Baseline Comparator — compare AI-generated test runs against hardcoded baselines.
 *
 * Workflow:
 * 1. Parse Playwright JSON reports from both baseline and AI-config runs
 * 2. Diff each test case: regression / improvement / unchanged / new / removed
 * 3. Generate prompt optimization suggestions from failure patterns
 * 4. Output formatted comparison report
 */



// ============================================================
// Types
// ============================================================

export interface TestCaseResult {
  title: string;
  file: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  durationMs: number;
  error?: string;
}

export interface TestRunSummary {
  label: string;
  timestamp: string;
  modules: string[];
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  passRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
  cases: TestCaseResult[];
}

export interface CaseDiff {
  title: string;
  file: string;
  change: 'regression' | 'improvement' | 'unchanged' | 'new' | 'removed';
  baselineStatus: TestCaseResult['status'] | null;
  aiConfigStatus: TestCaseResult['status'] | null;
  durationDiffMs: number;
  error?: string;
}

export interface PromptOptimization {
  category: 'seed-config' | 'body-template' | 'param-rewrite' | 'id-alias' | 'general';
  issue: string;
  suggestion: string;
  relatedCases: string[];
}

export interface ComparisonReport {
  baseline: TestRunSummary;
  aiConfig: TestRunSummary;
  passRateDiff: number;
  /** AI pass rate >= 85% of baseline */
  meetsThreshold: boolean;
  durationChangePercent: number;
  /** Duration change within ±10% */
  durationAcceptable: boolean;
  diffs: CaseDiff[];
  regressions: CaseDiff[];
  improvements: CaseDiff[];
  promptOptimizations: PromptOptimization[];
}

// ============================================================
// Playwright JSON Report Parsing
// ============================================================

/**
 * Parse a Playwright `--reporter=json` output into a TestRunSummary.
 */
export function parsePlaywrightReport(
  reportJson: Record<string, unknown>,
  label: string,
  modules: string[],
): TestRunSummary {
  const cases: TestCaseResult[] = [];

  if (reportJson?.suites && Array.isArray(reportJson.suites)) {
    for (const suite of reportJson.suites) {
      extractCases(suite, suite.title || '', cases);
    }
  }

  return buildTestRunSummary(label, modules, cases);
}

function extractCases(suite: Record<string, unknown>, parentTitle: string, result: TestCaseResult[]): void {
  const suiteTitle = parentTitle
    ? `${parentTitle} > ${(suite.title as string) || ''}`
    : (suite.title as string) || '';

  if (Array.isArray(suite.specs)) {
    for (const spec of suite.specs) {
      for (const test of spec.tests || []) {
        for (const testResult of test.results || []) {
          result.push({
            title: spec.title || '',
            file: (suite.file as string) || '',
            suite: suiteTitle,
            status: normalizeStatus(testResult.status),
            durationMs: testResult.duration || 0,
            error: testResult.error?.message,
          });
        }
      }
    }
  }

  if (Array.isArray(suite.suites)) {
    for (const child of suite.suites) {
      extractCases({ ...child, file: child.file || suite.file }, suiteTitle, result);
    }
  }
}

function normalizeStatus(status: string): TestCaseResult['status'] {
  switch (status) {
    case 'passed': case 'expected': return 'passed';
    case 'failed': case 'unexpected': return 'failed';
    case 'skipped': return 'skipped';
    case 'timedOut': return 'timedOut';
    default: return 'failed';
  }
}

/**
 * Build a TestRunSummary from raw test case results.
 */
export function buildTestRunSummary(label: string, modules: string[], cases: TestCaseResult[]): TestRunSummary {
  const passed = cases.filter((c) => c.status === 'passed').length;
  const failed = cases.filter((c) => c.status === 'failed').length;
  const skipped = cases.filter((c) => c.status === 'skipped').length;
  const timedOut = cases.filter((c) => c.status === 'timedOut').length;
  const totalDurationMs = cases.reduce((s, c) => s + c.durationMs, 0);

  return {
    label,
    timestamp: new Date().toISOString(),
    modules,
    total: cases.length,
    passed, failed, skipped, timedOut,
    passRate: cases.length > 0 ? passed / cases.length : 0,
    totalDurationMs,
    avgDurationMs: cases.length > 0 ? Math.round(totalDurationMs / cases.length) : 0,
    cases,
  };
}

// ============================================================
// Comparison
// ============================================================

/**
 * Compare two test runs and produce a detailed comparison report.
 */
export function compareTestRuns(baseline: TestRunSummary, aiConfig: TestRunSummary): ComparisonReport {
  const baselineMap = new Map(baseline.cases.map((c) => [caseKey(c), c]));
  const aiMap = new Map(aiConfig.cases.map((c) => [caseKey(c), c]));

  const allKeys = new Set([...baselineMap.keys(), ...aiMap.keys()]);
  const diffs: CaseDiff[] = [];

  for (const key of allKeys) {
    const base = baselineMap.get(key) ?? null;
    const ai = aiMap.get(key) ?? null;

    diffs.push({
      title: base?.title ?? ai?.title ?? key,
      file: base?.file ?? ai?.file ?? '',
      change: classifyChange(base?.status ?? null, ai?.status ?? null),
      baselineStatus: base?.status ?? null,
      aiConfigStatus: ai?.status ?? null,
      durationDiffMs: (ai?.durationMs ?? 0) - (base?.durationMs ?? 0),
      error: ai?.error,
    });
  }

  const regressions = diffs.filter((d) => d.change === 'regression');
  const improvements = diffs.filter((d) => d.change === 'improvement');
  const passRateDiff = aiConfig.passRate - baseline.passRate;
  const meetsThreshold = baseline.passRate > 0 ? aiConfig.passRate >= baseline.passRate * 0.85 : true;
  const durationChangePercent = baseline.totalDurationMs > 0
    ? ((aiConfig.totalDurationMs - baseline.totalDurationMs) / baseline.totalDurationMs) * 100
    : 0;

  return {
    baseline,
    aiConfig,
    passRateDiff,
    meetsThreshold,
    durationChangePercent,
    durationAcceptable: Math.abs(durationChangePercent) <= 10,
    diffs,
    regressions,
    improvements,
    promptOptimizations: analyzeFailures(regressions),
  };
}

function caseKey(c: TestCaseResult): string {
  return `${c.file}::${c.title}`;
}

function classifyChange(
  base: TestCaseResult['status'] | null,
  ai: TestCaseResult['status'] | null,
): CaseDiff['change'] {
  if (!base) return 'new';
  if (!ai) return 'removed';
  if (base === ai) return 'unchanged';
  if (base === 'passed' && ai !== 'passed') return 'regression';
  if (base !== 'passed' && ai === 'passed') return 'improvement';
  return 'unchanged';
}

// ============================================================
// Failure Analysis → Prompt Optimization
// ============================================================

function analyzeFailures(regressions: CaseDiff[]): PromptOptimization[] {
  const optimizations: PromptOptimization[] = [];
  const seedKw = ['seed', 'beforeall', 'setup', 'beforeeach'];
  const bodyKw = ['body', 'required', 'validation', '400', 'bad request', 'field'];
  const paramKw = ['param', ':id', 'undefined', 'null', '404', 'not found'];

  const seedFails = regressions.filter((r) => r.error && seedKw.some((k) => r.error!.toLowerCase().includes(k)));
  const bodyFails = regressions.filter((r) => r.error && bodyKw.some((k) => r.error!.toLowerCase().includes(k)));
  const paramFails = regressions.filter((r) => r.error && paramKw.some((k) => r.error!.toLowerCase().includes(k)));

  if (seedFails.length > 0) {
    optimizations.push({
      category: 'seed-config',
      issue: `${seedFails.length} test(s) regressed due to seed data preparation failures`,
      suggestion: 'Ensure AI-generated seed paths match actual API routes and dependency order is correct.',
      relatedCases: seedFails.map((r) => r.title),
    });
  }

  if (bodyFails.length > 0) {
    optimizations.push({
      category: 'body-template',
      issue: `${bodyFails.length} test(s) regressed due to incomplete body templates`,
      suggestion: 'List all required fields in prompts, include DTO enum constraints.',
      relatedCases: bodyFails.map((r) => r.title),
    });
  }

  if (paramFails.length > 0) {
    optimizations.push({
      category: 'param-rewrite',
      issue: `${paramFails.length} test(s) regressed due to parameter mapping errors`,
      suggestion: 'Explicitly define :id → semantic name mappings in prompts.',
      relatedCases: paramFails.map((r) => r.title),
    });
  }

  const other = regressions.filter(
    (r) => !seedFails.includes(r) && !bodyFails.includes(r) && !paramFails.includes(r),
  );
  if (other.length > 0) {
    optimizations.push({
      category: 'general',
      issue: `${other.length} test(s) regressed due to other reasons`,
      suggestion: 'Inspect individual error messages for business logic or data dependency issues.',
      relatedCases: other.map((r) => r.title),
    });
  }

  return optimizations;
}

// ============================================================
// Report Formatting
// ============================================================

/**
 * Format a ComparisonReport into human-readable text.
 */
export function formatComparisonReport(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push('  Baseline Comparison Report');
  lines.push('═'.repeat(60), '');

  lines.push('┌─ Pass Rate ────────────────────────────────────┐');
  lines.push(`│ Baseline (${report.baseline.label}): ${(report.baseline.passRate * 100).toFixed(1)}% (${report.baseline.passed}/${report.baseline.total})`);
  lines.push(`│ AI Config (${report.aiConfig.label}): ${(report.aiConfig.passRate * 100).toFixed(1)}% (${report.aiConfig.passed}/${report.aiConfig.total})`);
  lines.push(`│ Diff: ${report.passRateDiff >= 0 ? '+' : ''}${(report.passRateDiff * 100).toFixed(1)}pp`);
  lines.push(`│ Meets threshold (≥ 85%): ${report.meetsThreshold ? '✓' : '✗'}`);
  lines.push('└────────────────────────────────────────────────┘', '');

  lines.push('┌─ Duration ─────────────────────────────────────┐');
  lines.push(`│ Baseline: ${(report.baseline.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push(`│ AI Config: ${(report.aiConfig.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push(`│ Change: ${report.durationChangePercent >= 0 ? '+' : ''}${report.durationChangePercent.toFixed(1)}%`);
  lines.push(`│ Acceptable (±10%): ${report.durationAcceptable ? '✓' : '✗'}`);
  lines.push('└────────────────────────────────────────────────┘', '');

  if (report.regressions.length > 0) {
    lines.push(`⚠ Regressions (${report.regressions.length}):`);
    for (const r of report.regressions) {
      lines.push(`  ✗ ${r.title}`);
      if (r.error) lines.push(`    Error: ${r.error.substring(0, 100)}`);
    }
    lines.push('');
  }

  if (report.improvements.length > 0) {
    lines.push(`✓ Improvements (${report.improvements.length}):`);
    for (const imp of report.improvements) lines.push(`  ✓ ${imp.title}`);
    lines.push('');
  }

  if (report.promptOptimizations.length > 0) {
    lines.push('─'.repeat(60));
    lines.push('  Prompt Optimization Suggestions');
    lines.push('─'.repeat(60));
    for (const opt of report.promptOptimizations) {
      lines.push(`\n  [${opt.category}] ${opt.issue}`);
      lines.push(`  Suggestion: ${opt.suggestion}`);
      lines.push(`  Related: ${opt.relatedCases.join(', ')}`);
    }
  }

  lines.push('', '═'.repeat(60));
  return lines.join('\n');
}
