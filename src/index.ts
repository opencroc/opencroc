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
  RuntimeConfig,
  HookConfig,
  ExecutionConfig,
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
export { createSelfHealingLoop, categorizeFailure, analyzeFailureWithLLM } from './self-healing/index.js';

// --- LLM ---
export { createLlmProvider, createOpenAIProvider, createOllamaProvider, createTokenTracker, SYSTEM_PROMPTS } from './llm/index.js';

// --- Adapters ---
export type { BackendAdapter, LlmProvider } from './adapters/types.js';
export { createSequelizeAdapter } from './adapters/sequelize.js';
export { createTypeORMAdapter } from './adapters/typeorm.js';
export { createPrismaAdapter } from './adapters/prisma.js';
export { createDrizzleAdapter, parseDrizzleFile, parseDrizzleDirectory } from './adapters/drizzle.js';
export { createAdapter, detectAdapter, resolveAdapter } from './adapters/registry.js';

// --- Plugins ---
export type { OpenCrocPlugin, PluginRegistry } from './plugins/types.js';
export { createPluginRegistry, definePlugin } from './plugins/index.js';

// --- CI Templates ---
export { generateCiTemplate, listCiPlatforms, generateGitHubActionsTemplate, generateGitLabCITemplate } from './ci/index.js';

// --- Reporters ---
export type { ReportOutput } from './reporters/index.js';
export { generateReports, generateHtmlReport, generateJsonReport, generateMarkdownReport } from './reporters/index.js';

// --- Visual Dashboard ---
export type { DashboardData, DashboardOutput } from './dashboard/index.js';
export {
  buildDashboardDataFromPipeline,
  buildDashboardDataFromReportJson,
  generateVisualDashboardHtml,
  generateVisualDashboard,
} from './dashboard/index.js';

// --- VSCode Extension Scaffold ---
export { COMMANDS as VSCODE_COMMANDS, generateExtensionManifest, generateExtensionEntrypoint, buildModuleTree, buildStatusTree } from './vscode/index.js';

// --- Runtime Infrastructure ---
export { generatePlaywrightConfig, generateGlobalSetup, generateGlobalTeardown, generateAuthSetup } from './runtime/index.js';
export { resilientFetch, waitForBackend } from './runtime/resilient-fetch.js';
export { NetworkMonitor } from './runtime/network-monitor.js';
export { extractParamNames, extractParamsFromHref, buildPath, extractIdFromText, resolveFromSeedData } from './runtime/dynamic-route-resolver.js';
export type { AttemptRecord, ResilientFetchOptions, ResilientFetchResult } from './runtime/resilient-fetch.js';
export type { NetworkError, ApiRecord, NetworkMonitorOptions } from './runtime/network-monitor.js';
export type { ResolvedRoute } from './runtime/dynamic-route-resolver.js';
export { selectCandidates, selectCandidatesFromLogs, mergeCandidates, waitForLogCompletion } from './runtime/log-completion-waiter.js';
export { createRulesEngine } from './runtime/critical-api-rules.js';
export type { CandidateApiRequest, LogCompletionResult, LogEntry, LogPollerOptions } from './runtime/log-completion-waiter.js';
export type { CriticalApiRule, ApiRuleViolation, ApiRecordForRules } from './runtime/critical-api-rules.js';
