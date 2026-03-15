// ===== User-facing Config =====

export interface OpenCrocConfig {
  /** Path to the backend source code root */
  backendRoot: string;

  /** Test output directory (default: ./opencroc-output) */
  outDir?: string;

  /** Backend adapter: 'sequelize' | 'typeorm' | 'prisma' | custom BackendAdapter */
  adapter?: string | BackendAdapter;

  /** LLM provider configuration */
  llm?: LlmConfig;

  /** Playwright configuration overrides */
  playwright?: PlaywrightOverrides;

  /** Module filter — only process these modules */
  modules?: string[];

  /** Pipeline step selection */
  steps?: PipelineStep[];

  /** Self-healing configuration */
  selfHealing?: SelfHealingConfig;

  /** Test execution hooks (setup/auth/teardown) */
  execution?: ExecutionConfig;

  /** Runtime infrastructure generation config */
  runtime?: RuntimeConfig;

  /** Report configuration */
  report?: ReportConfig;
}

export interface ResolvedConfig extends Required<OpenCrocConfig> {
  _resolved: true;
}

export interface LlmConfig {
  provider: 'openai' | 'zhipu' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface PlaywrightOverrides {
  baseURL?: string;
  headless?: boolean;
  timeout?: number;
  /** Number of parallel workers (default: 2, CI: 4) */
  workers?: number;
  /** Retry count on failure (default: 0, CI: 1) */
  retries?: number;
  /** Action timeout in ms (default: 10000) */
  actionTimeout?: number;
  /** Navigation timeout in ms */
  navigationTimeout?: number;
}

export interface RuntimeConfig {
  /** Authentication strategy */
  auth?: {
    /** Login API URL for credential-based auth */
    loginUrl?: string;
    /** Credentials for automatic auth setup */
    username?: string;
    password?: string;
    /** Storage state file path (default: playwright/.auth/user.json) */
    storageStatePath?: string;
  };
  /** Database seed/cleanup configuration */
  db?: {
    /** Backend seed endpoint (e.g. /internal/e2e/seed) */
    seedEndpoint?: string;
    /** Backend cleanup endpoint (e.g. /internal/e2e/cleanup) */
    cleanupEndpoint?: string;
    /** SQL file to execute for seeding */
    seedFile?: string;
    /** SQL file to execute for cleanup */
    cleanupFile?: string;
  };
  /** Test log management endpoint */
  logEndpoint?: string;
  /** Additional Playwright projects beyond the defaults */
  extraProjects?: Array<{
    name: string;
    testMatch: string;
    dependencies?: string[];
    useAuth?: boolean;
  }>;
}

export interface SelfHealingConfig {
  enabled?: boolean;
  maxIterations?: number;
  mode?: 'config-only' | 'config-and-source';
}

export type HookConfig =
  | string
  | {
      command: string;
      args?: string[];
      cwd?: string;
    };

export interface ExecutionConfig {
  setupHook?: HookConfig;
  authHook?: HookConfig;
  teardownHook?: HookConfig;
}

export interface ReportConfig {
  format?: ('html' | 'json' | 'markdown')[];
  outputDir?: string;
}

export type PipelineStep =
  | 'scan'
  | 'er-diagram'
  | 'api-chain'
  | 'plan'
  | 'codegen'
  | 'validate';

// ===== Module / Schema Types =====

export interface ModuleDefinition {
  name: string;
  label?: string;
  modelDir: string;
  controllerDir: string;
  associationFile?: string;
  /** Controller file paths (resolved) */
  controllerPaths?: string[];
  /** Service file paths (for inferring related tables) */
  servicePaths?: string[];
  /** Table name prefix for this module (e.g. 'user_') */
  tablePrefix?: string;
}

export interface RouteEntry {
  method: string;
  path: string;
  handler: string;
  controllerClass: string;
}

export interface FieldSchema {
  name: string;
  type: string;
  allowNull?: boolean;
  defaultValue?: unknown;
  primaryKey?: boolean;
  unique?: boolean;
  comment?: string;
}

export interface TableSchema {
  tableName: string;
  className?: string;
  fields: FieldSchema[];
  indexes?: IndexSchema[];
}

export interface IndexSchema {
  name?: string;
  unique?: boolean;
  fields: string[];
}

export interface ForeignKeyRelation {
  sourceTable: string;
  sourceField: string;
  targetTable: string;
  targetField: string;
  cardinality: '1:N' | 'N:1' | '1:1';
  isCrossModule?: boolean;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  bodyFields: string[];
  responseFields: string[];
  relatedTables: string[];
  description: string;
}

export interface ApiDependency {
  from: ApiEndpoint;
  to: ApiEndpoint;
  paramMapping: Record<string, string>;
}

// ===== Graph Types =====

export interface DirectedAcyclicGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; label?: string }>;
}

export interface ApiChainAnalysisResult {
  moduleName: string;
  endpoints: ApiEndpoint[];
  dependencies: ApiDependency[];
  dag: DirectedAcyclicGraph;
  hasCycles: boolean;
  cycleWarnings: string[];
}

// ===== Pipeline Result Types =====

export interface ERDiagramResult {
  tables: TableSchema[];
  relations: ForeignKeyRelation[];
  mermaidText: string;
}

export interface TestStep {
  order: number;
  action: string;
  endpoint: ApiEndpoint;
  description: string;
  assertions: string[];
}

export interface TestChain {
  name: string;
  module: string;
  steps: TestStep[];
}

export interface ChainPlanResult {
  chains: TestChain[];
  totalSteps: number;
}

export interface GeneratedTestFile {
  filePath: string;
  content: string;
  module: string;
  chain: string;
}

export interface PipelineRunResult {
  modules: string[];
  erDiagrams: Map<string, ERDiagramResult>;
  chainPlans: Map<string, ChainPlanResult>;
  generatedFiles: GeneratedTestFile[];
  validationErrors: ValidationError[];
  duration: number;
}

export interface ChainFailureResult {
  chain: string;
  failedStep: number;
  error: string;
  rootCause?: string;
  category?: string;
  confidence?: number;
  impactedChains: string[];
  errorChainPath?: string;
}

export interface ImpactReport {
  affectedModules: string[];
  affectedChains: string[];
  affectedEndpoints: ApiEndpoint[];
  affectedTables: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  mermaidText: string;
}

export interface ValidationError {
  module: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ===== Self-Healing Types =====

export interface SelfHealingResult {
  iterations: number;
  fixed: string[];
  remaining: string[];
  totalTokensUsed: number;
}

export interface FixOutcome {
  success: boolean;
  scope: 'config-only' | 'config-and-source';
  fixedItems: string[];
  rolledBack: boolean;
}

// ===== Advanced Self-Healing Types (v1.1) =====

export type FixScope = 'config-only' | 'config-and-source';

export interface DialogLoopConfig {
  maxIterations?: number;
  pollIntervalMs?: number;
  sameErrorThreshold?: number;
  autoRerunOnFix?: boolean;
}

export interface TestFailureInfo {
  title: string;
  error: string;
  attribution?: AIAttributionResult;
}

export interface IterationResult {
  iteration: number;
  totalTests: number;
  passed: number;
  failed: number;
  failedTests: string[];
  fixesApplied: string[];
  durationMs: number;
}

export interface DialogLoopSummary {
  iterations: IterationResult[];
  finalPassed: number;
  finalFailed: number;
  totalFixesApplied: number;
  success: boolean;
}

export interface ControlledFixOptions {
  scope?: FixScope;
  dryRun?: boolean;
  verify?: boolean;
  reportDir?: string;
}

export interface ControlledFixOutcome {
  success: boolean;
  scope: FixScope;
  fixedItems: string[];
  rolledBack: boolean;
  prUrl?: string;
  error?: string;
}

export interface AIAttributionResult {
  testName: string;
  rootCause: string;
  category: 'frontend' | 'backend' | 'network' | 'environment' | 'test-script';
  severity: 'critical' | 'high' | 'medium' | 'low';
  fixSuggestion: {
    description: string;
    filePath: string;
    codePatch: string;
  };
  confidence: number;
}

export interface AutoFixPROptions {
  branchPrefix?: string;
  baseBranch?: string;
  draftOnly?: boolean;
}

export interface AutoFixPRResult {
  prUrl: string;
  branch: string;
  patchFile: string;
}

// ===== Advanced Reporter Types (v1.2) =====

export type FailureCategory = 'backend-5xx' | 'mixed-5xx' | 'slow-api' | 'log-fail' | 'log-timeout' | 'frontend-load' | 'other';

export interface TestResultRecord {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  error?: string;
  logCompletion?: LogCompletionRecord;
}

export interface LogCompletionRecord {
  candidateCount: number;
  succeeded: Array<{ method: string; path: string }>;
  failed: Array<{ method: string; path: string }>;
  timedOut: Array<{ method: string; path: string }>;
}

export interface FailureSummary {
  totalFailed: number;
  backend5xx: number;
  mixed5xx: number;
  slowApi: number;
  logFail: number;
  logTimeout: number;
  frontendLoad: number;
  other: number;
}

export interface BackendDomainItem {
  domain: string;
  tests: string[];
  endpoints: string[];
}

export interface LogCompletionSummary {
  totalCandidates: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  matchRate: number;
  effectiveRate: number;
  timedOutTop5: Array<{ method: string; path: string; occurrences: number }>;
}

export interface WorkorderItem {
  index: number;
  domain: string;
  priority: 'P0' | 'P1' | 'P2';
  tests: string[];
  endpoints: string[];
  objective: string;
  acceptanceCriteria: string[];
}

export interface TokenUsageEntry {
  category: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

export interface TokenUsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEstimatedCost: number;
  avgLatencyMs: number;
  byCategory: Record<string, { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number }>;
  byModel: Record<string, { requests: number; totalTokens: number; estimatedCost: number }>;
  budgetUsedPercent: number | null;
  budgetExceeded: boolean;
}

// ===== Module Test Config (AI-Generated) =====

export interface ModuleTestConfig {
  moduleName: string;
  version: string;
  generatedAt: string;
  bodyTemplates: Record<string, Record<string, unknown>>;
  paramRewrites: Record<string, Record<string, string>>;
  idAliases: Array<{ pathPattern: string; alias: string }>;
  specialUrls: Record<string, string>;
  seed: SeedStep[];
}

export interface SeedStep {
  step: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
  captureAs?: string;
  required: boolean;
  dependsOn?: string[];
  failureMessage?: string;
}

// ===== Module Config Validation =====

export type ModuleConfigErrorType =
  | 'missing-field' | 'invalid-type' | 'invalid-format'
  | 'interface-not-found' | 'field-missing' | 'type-mismatch'
  | 'dependency-cycle' | 'dependency-missing' | 'seed-order-invalid'
  | 'param-mapping-invalid' | 'compile-error' | 'unknown';

export interface ModuleConfigValidationError {
  layer: 'schema' | 'semantic' | 'dryrun';
  type: ModuleConfigErrorType;
  path: string;
  message: string;
  suggestion?: string;
}

export interface ModuleConfigValidationWarning {
  layer: 'schema' | 'semantic' | 'dryrun';
  path: string;
  message: string;
}

export interface LayerValidationResult {
  passed: boolean;
  layer: 'schema' | 'semantic' | 'dryrun';
  errors: ModuleConfigValidationError[];
  warnings: ModuleConfigValidationWarning[];
}

export interface ModuleConfigValidationResult {
  passed: boolean;
  lastPassedLayer?: 'schema' | 'semantic' | 'dryrun';
  failedAtLayer?: 'schema' | 'semantic' | 'dryrun';
  schemaResult?: LayerValidationResult;
  semanticResult?: LayerValidationResult;
  dryrunResult?: LayerValidationResult;
  errors: ModuleConfigValidationError[];
  warnings: ModuleConfigValidationWarning[];
}

/** DTO (TypeScript interface) information */
export interface DTOInfo {
  name: string;
  sourcePath?: string;
  fields: DTOFieldInfo[];
  extends?: string;
}

export interface DTOFieldInfo {
  name: string;
  type: string;
  required: boolean;
  enumValues?: string[];
  isSystemField?: boolean;
}

/** express-validator rule */
export interface ValidatorRule {
  field: string;
  source: 'body' | 'param' | 'query';
  rules: string[];
}

/** Module metadata from DTO scanning */
export interface ModuleMetadata {
  moduleName: string;
  dtos: DTOInfo[];
  validatorRules: Map<string, ValidatorRule[]>;
  timestamp: string;
}

export interface ModuleConfigValidationContext {
  endpoints: ApiEndpoint[];
  dtos: DTOInfo[];
}

// ===== Auto-Fixer =====

export interface FixContext {
  endpoints: ApiEndpoint[];
  dtos: DTOInfo[];
}

export interface FixHistoryEntry {
  timestamp: string;
  attempt: number;
  errorType: string;
  errorPath: string;
  errorMessage: string;
  fixerUsed: string;
  changedKeys: string[];
  validationPassedAfterFix: boolean;
}

export interface FixResult {
  success: boolean;
  config: ModuleTestConfig;
  totalAttempts: number;
  history: FixHistoryEntry[];
  remainingErrors: ModuleConfigValidationError[];
}

// ===== Adapter Types =====

export interface BackendAdapter {
  name: string;
  parseModels(dir: string): Promise<TableSchema[]>;
  parseAssociations(file: string): Promise<ForeignKeyRelation[]>;
  parseControllers(dir: string): Promise<RouteEntry[]>;
}

export interface LlmProvider {
  name: string;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  estimateTokens(text: string): number;
}
