// OpenCroc — AI-native E2E Testing & Project Intelligence Platform
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
  FixScope,
  DialogLoopConfig,
  TestFailureInfo,
  IterationResult,
  DialogLoopSummary,
  ControlledFixOptions,
  ControlledFixOutcome,
  AIAttributionResult,
  AutoFixPROptions,
  AutoFixPRResult,
  FailureCategory,
  TestResultRecord,
  LogCompletionRecord,
  FailureSummary,
  BackendDomainItem,
  LogCompletionSummary,
  WorkorderItem,
  TokenUsageEntry,
  TokenUsageSummary,
  // Sprint 2-3 types
  ModuleTestConfig,
  SeedStep,
  ModuleConfigErrorType,
  ModuleConfigValidationError,
  ModuleConfigValidationWarning,
  LayerValidationResult,
  ModuleConfigValidationResult,
  ModuleConfigValidationContext,
  DTOInfo,
  DTOFieldInfo,
  ValidatorRule,
  ModuleMetadata,
  FixContext,
  FixHistoryEntry,
  FixResult,
} from './types.js';

// --- Config ---
export { defineConfig } from './config.js';

// --- Pipeline ---
export { createPipeline } from './pipeline/index.js';

// --- Parsers ---
export { createModelParser, parseModelFile, parseModuleModels } from './parsers/model-parser.js';
export { createControllerParser, parseControllerFile, parseControllerDirectory, inferRelatedTables } from './parsers/controller-parser.js';
export { createAssociationParser, parseAssociationFile, buildClassToTableMap, classNameToTableName } from './parsers/association-parser.js';
export { parseDTOs, parseValidatorRules, scanModuleMetadata } from './parsers/dto-parser.js';

// --- Generators ---
export { createTestCodeGenerator } from './generators/test-code-generator.js';
export { createMockDataGenerator } from './generators/mock-data-generator.js';
export { createERDiagramGenerator } from './generators/er-diagram-generator.js';

// --- Analyzers ---
export { createApiChainAnalyzer, inferDependencies, buildGraph, detectCycles, topologicalSort } from './analyzers/api-chain-analyzer.js';
export { createImpactReporter } from './analyzers/impact-reporter.js';

// --- Planners ---
export { createChainPlanner, createLlmChainPlanner } from './planners/chain-planner.js';

// --- Validators ---
export { validateConfig, validateModuleConfig, formatValidationResult } from './validators/config-validator.js';
export { validateSchema } from './validators/schema-validator.js';
export { validateSemantic } from './validators/semantic-validator.js';
export { validateDryrun } from './validators/dryrun-validator.js';

// --- Tools ---
export { generateModuleConfig, generateAllModuleConfigs, recoverJSON } from './tools/ai-config-suggester.js';
export { generateEnhancedConfig } from './tools/enhanced-ai-suggester.js';
export { autoFix } from './tools/auto-fixer.js';
export { parsePlaywrightReport, buildTestRunSummary, compareTestRuns, formatComparisonReport } from './tools/baseline-comparator.js';
export { loadModulePresets, getModulePreset, listModulePresets } from './tools/preset-loader.js';

// --- Self-Healing ---
export { createSelfHealingLoop, categorizeFailure, analyzeFailureWithLLM } from './self-healing/index.js';
export { runDialogLoop, createJsonResultParser } from './self-healing/index.js';
export type { TestRunner, ResultParser, FixApplier, DialogLoopOptions } from './self-healing/index.js';
export { applyControlledFix } from './self-healing/index.js';
export type { ConfigValidator, ConfigFixer, PRGenerator, FsOps, ControlledFixerOptions } from './self-healing/index.js';
export { generateFixPR } from './self-healing/index.js';
export type { GitExecutor, PatchWriter } from './self-healing/index.js';

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

// --- Feishu Bridge ---
export type {
  FeishuBridgeConfig,
  FeishuTaskTarget,
  FeishuOutboundMessage,
  FeishuBridgeDelivery,
} from './server/feishu-bridge.js';
export { FeishuProgressBridge } from './server/feishu-bridge.js';
export { FeishuApiDelivery } from './server/feishu-delivery.js';

// --- CI Templates ---
export { generateCiTemplate, listCiPlatforms, generateGitHubActionsTemplate, generateGitLabCITemplate } from './ci/index.js';

// --- Reporters ---
export type { ReportOutput, BuildWorkordersOptions } from './reporters/index.js';
export { generateReports, generateHtmlReport, generateJsonReport, generateMarkdownReport } from './reporters/index.js';
export { classifyFailure, buildFailureSummary, aggregateLogCompletion, parseApiDomain, buildBackendChecklist, renderChecklistMarkdown } from './reporters/index.js';
export { buildWorkorders, renderWorkordersMarkdown } from './reporters/index.js';
export { TokenTracker, renderTokenReportMarkdown } from './reporters/index.js';

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

// --- Orchestration ---
export { createOrchestrator } from './orchestrator/index.js';
export { writeOrchestrationSummary, printOrchestrationSummary } from './orchestrator/reporter.js';
export type {
  PhaseStatus,
  PhaseResult,
  OrchestrationOptions,
  OrchestrationPhase,
  ExecutionMetrics,
  OrchestrationSummary,
} from './orchestrator/index.js';
export type { OrchestrationReportOptions } from './orchestrator/reporter.js';

// --- Scanner (Universal Project Analysis) ---
export { detectProject } from './scanner/language-detector.js';
export type { LanguageDetectionResult } from './scanner/language-detector.js';
export { scanProject } from './scanner/project-scanner.js';
export type { ScanOptions } from './scanner/project-scanner.js';
export { cloneAndScan } from './scanner/github-cloner.js';
export type { CloneOptions } from './scanner/github-cloner.js';

// --- Knowledge Graph ---
export type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphEdgeRelation,
  KnowledgeGraph as StudioKnowledgeGraph,
  ProjectMetadata,
  ProjectStats,
  ProjectType,
  RiskAnnotation,
  RiskCategory,
  RiskSeverity,
  ImpactAnalysis,
  PerspectiveReport,
  ReportPerspective,
  ReportSection,
  SimulationScenario,
  SimulationResult,
  ScanResult,
  FrameworkDetection,
  DiscoveredFile,
  ExtractedEntity,
  ExtractedRelationship,
} from './graph/types.js';
export {
  buildKnowledgeGraph,
  queryNodes,
  getNeighbors,
  bfsTraversal,
  findPaths,
  toMermaid,
  getGraphStats,
} from './graph/index.js';

// --- Insight (AI Analysis) ---
export {
  analyzeRisks,
  analyzeImpact,
  generateReport as generateInsightReport,
  simulateScenario,
} from './insight/index.js';

// --- Agents (Dynamic Role System) ---
export { getRoleRegistry, RoleRegistry } from './agents/role-registry.js';
export { planSummon, buildMatchContext } from './agents/task-router.js';
export type { RoleDefinition, RoleCategory, RoleTrigger, MatchContext } from './agents/role-registry.js';
export type { SummonPlan, SummonedRole } from './agents/task-router.js';
