// OpenCroc — AI-native E2E Testing Framework
// Public API

// --- Core Types ---
export type { OpenCrocConfig, ResolvedConfig } from './types.js';
export type {
  ModuleDefinition,
  RouteEntry,
  FieldSchema,
  TableSchema,
  ForeignKeyRelation,
  ApiEndpoint,
  ApiDependency,
  TestStep,
  TestChain,
  ChainPlanResult,
  GeneratedTestFile,
  PipelineRunResult,
  ERDiagramResult,
  ChainFailureResult,
  ImpactReport,
} from './types.js';

// --- Config ---
export { defineConfig } from './config.js';

// --- Pipeline ---
export { createPipeline } from './pipeline/index.js';

// --- Parsers ---
export { createModelParser } from './parsers/model-parser.js';
export { createControllerParser } from './parsers/controller-parser.js';
export { createAssociationParser } from './parsers/association-parser.js';

// --- Generators ---
export { createTestCodeGenerator } from './generators/test-code-generator.js';
export { createMockDataGenerator } from './generators/mock-data-generator.js';
export { createERDiagramGenerator } from './generators/er-diagram-generator.js';

// --- Analyzers ---
export { createApiChainAnalyzer } from './analyzers/api-chain-analyzer.js';
export { createImpactReporter } from './analyzers/impact-reporter.js';

// --- Validators ---
export { validateConfig } from './validators/config-validator.js';

// --- Self-Healing ---
export { createSelfHealingLoop } from './self-healing/index.js';

// --- Adapters ---
export type { BackendAdapter } from './adapters/types.js';
export type { LlmProvider } from './adapters/types.js';
