// OpenCroc — AI-native E2E Testing Framework
// Public API

// --- Core Types ---
export type {
  OpenCrocConfig,
  ResolvedConfig,
  ModuleDefinition,
  RouteEntry,
  FieldSchema,
  TableSchema,
  IndexSchema,
  ForeignKeyRelation,
  ApiEndpoint,
  ApiDependency,
  DirectedAcyclicGraph,
  ApiChainAnalysisResult,
  TestStep,
  TestChain,
  ChainPlanResult,
  GeneratedTestFile,
  PipelineRunResult,
  ERDiagramResult,
  ChainFailureResult,
  ImpactReport,
  ValidationError,
  SelfHealingResult,
  FixOutcome,
} from './types.js';

// --- Config ---
export { defineConfig } from './config.js';

// --- Pipeline ---
export { createPipeline } from './pipeline/index.js';

// --- Parsers ---
export { createModelParser, parseModelFile, parseModuleModels } from './parsers/model-parser.js';
export { createControllerParser, parseControllerFile, parseControllerDirectory, inferRelatedTables } from './parsers/controller-parser.js';
export { createAssociationParser, parseAssociationFile, buildClassToTableMap, classNameToTableName } from './parsers/association-parser.js';

// --- Generators ---
export { createTestCodeGenerator } from './generators/test-code-generator.js';
export { createMockDataGenerator } from './generators/mock-data-generator.js';
export { createERDiagramGenerator } from './generators/er-diagram-generator.js';

// --- Analyzers ---
export { createApiChainAnalyzer, inferDependencies, buildGraph, detectCycles, topologicalSort } from './analyzers/api-chain-analyzer.js';
export { createImpactReporter } from './analyzers/impact-reporter.js';

// --- Validators ---
export { validateConfig } from './validators/config-validator.js';

// --- Self-Healing ---
export { createSelfHealingLoop, categorizeFailure } from './self-healing/index.js';

// --- Adapters ---
export type { BackendAdapter, LlmProvider } from './adapters/types.js';
