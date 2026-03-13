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
}

export interface SelfHealingConfig {
  enabled?: boolean;
  maxIterations?: number;
  mode?: 'config-only' | 'config-and-source';
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
  className: string;
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
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  type: 'belongsTo' | 'hasMany' | 'hasOne' | 'belongsToMany';
}

export interface ApiEndpoint {
  method: string;
  path: string;
  handler: string;
  module: string;
  params?: string[];
  bodyFields?: string[];
}

export interface ApiDependency {
  from: ApiEndpoint;
  to: ApiEndpoint;
  reason: string;
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
  impactedChains: string[];
}

export interface ImpactReport {
  affectedModules: string[];
  affectedChains: string[];
  affectedEndpoints: ApiEndpoint[];
  mermaidText: string;
}

export interface ValidationError {
  module: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
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
