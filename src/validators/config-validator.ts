import type {
  ValidationError,
  ModuleTestConfig,
  ModuleConfigValidationContext,
  ModuleConfigValidationResult,
  ModuleConfigValidationError,
  ModuleConfigValidationWarning,
} from '../types.js';
import { validateSchema } from './schema-validator.js';
import { validateSemantic } from './semantic-validator.js';
import { validateDryrun } from './dryrun-validator.js';

const REQUIRED_FIELDS = ['backendRoot'];

const VALID_ADAPTERS = ['sequelize', 'typeorm', 'prisma', 'drizzle'];
const VALID_STEPS = ['scan', 'er-diagram', 'api-chain', 'plan', 'codegen', 'validate'];
const VALID_LLM_PROVIDERS = ['openai', 'zhipu', 'ollama', 'custom'];
const VALID_REPORT_FORMATS = ['html', 'json', 'markdown'];
const VALID_HEAL_MODES = ['config-only', 'config-and-source'];

/**
 * Validate an OpenCroc configuration object.
 * Returns an array of ValidationErrors (empty = valid).
 */
export function validateConfig(config: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!config[field]) {
      errors.push({
        module: 'config',
        field,
        message: `Missing required field: ${field}`,
        severity: 'error',
      });
    }
  }

  // backendRoot must be a string
  if (config.backendRoot && typeof config.backendRoot !== 'string') {
    errors.push({
      module: 'config',
      field: 'backendRoot',
      message: 'backendRoot must be a string path',
      severity: 'error',
    });
  }

  // adapter validation
  if (config.adapter && typeof config.adapter === 'string') {
    if (!VALID_ADAPTERS.includes(config.adapter)) {
      errors.push({
        module: 'config',
        field: 'adapter',
        message: `Invalid adapter: ${config.adapter}. Must be one of: ${VALID_ADAPTERS.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // steps validation
  if (config.steps && Array.isArray(config.steps)) {
    for (const step of config.steps) {
      if (!VALID_STEPS.includes(step as string)) {
        errors.push({
          module: 'config',
          field: 'steps',
          message: `Invalid pipeline step: ${step}. Must be one of: ${VALID_STEPS.join(', ')}`,
          severity: 'error',
        });
      }
    }
  }

  // LLM config validation
  if (config.llm && typeof config.llm === 'object') {
    const llm = config.llm as Record<string, unknown>;
    if (llm.provider && !VALID_LLM_PROVIDERS.includes(llm.provider as string)) {
      errors.push({
        module: 'config',
        field: 'llm.provider',
        message: `Invalid LLM provider: ${llm.provider}. Must be one of: ${VALID_LLM_PROVIDERS.join(', ')}`,
        severity: 'error',
      });
    }
    if (llm.provider && llm.provider !== 'ollama' && !llm.apiKey) {
      errors.push({
        module: 'config',
        field: 'llm.apiKey',
        message: 'LLM apiKey is required for cloud providers',
        severity: 'warning',
      });
    }
  }

  // Report config validation
  if (config.report && typeof config.report === 'object') {
    const report = config.report as Record<string, unknown>;
    if (report.format && Array.isArray(report.format)) {
      for (const fmt of report.format) {
        if (!VALID_REPORT_FORMATS.includes(fmt as string)) {
          errors.push({
            module: 'config',
            field: 'report.format',
            message: `Invalid report format: ${fmt}. Must be one of: ${VALID_REPORT_FORMATS.join(', ')}`,
            severity: 'error',
          });
        }
      }
    }
  }

  // Self-healing config validation
  if (config.selfHealing && typeof config.selfHealing === 'object') {
    const sh = config.selfHealing as Record<string, unknown>;
    if (sh.mode && !VALID_HEAL_MODES.includes(sh.mode as string)) {
      errors.push({
        module: 'config',
        field: 'selfHealing.mode',
        message: `Invalid self-healing mode: ${sh.mode}. Must be one of: ${VALID_HEAL_MODES.join(', ')}`,
        severity: 'error',
      });
    }
    if (sh.maxIterations && (typeof sh.maxIterations !== 'number' || sh.maxIterations < 1)) {
      errors.push({
        module: 'config',
        field: 'selfHealing.maxIterations',
        message: 'maxIterations must be a positive number',
        severity: 'error',
      });
    }
  }

  // Execution hooks validation
  if (config.execution && typeof config.execution === 'object') {
    const execution = config.execution as Record<string, unknown>;
    const hookFields = ['setupHook', 'authHook', 'teardownHook'];

    for (const hookField of hookFields) {
      const hook = execution[hookField];
      if (hook === undefined) continue;

      if (typeof hook === 'string') continue;

      if (typeof hook !== 'object' || hook === null) {
        errors.push({
          module: 'config',
          field: `execution.${hookField}`,
          message: `${hookField} must be a string command or an object { command, args?, cwd? }`,
          severity: 'error',
        });
        continue;
      }

      const hookObj = hook as Record<string, unknown>;
      if (typeof hookObj.command !== 'string' || hookObj.command.trim() === '') {
        errors.push({
          module: 'config',
          field: `execution.${hookField}.command`,
          message: 'command is required and must be a non-empty string',
          severity: 'error',
        });
      }

      if (hookObj.args !== undefined && (!Array.isArray(hookObj.args) || hookObj.args.some((a) => typeof a !== 'string'))) {
        errors.push({
          module: 'config',
          field: `execution.${hookField}.args`,
          message: 'args must be an array of strings',
          severity: 'error',
        });
      }

      if (hookObj.cwd !== undefined && typeof hookObj.cwd !== 'string') {
        errors.push({
          module: 'config',
          field: `execution.${hookField}.cwd`,
          message: 'cwd must be a string path',
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

// ============================================================
// Three-Layer Module Config Validator
// ============================================================

export interface ValidateModuleConfigOptions {
  stopOnFailure?: boolean;
  skipLayers?: Array<'schema' | 'semantic' | 'dryrun'>;
}

export function validateModuleConfig(
  config: unknown,
  context?: ModuleConfigValidationContext,
  options?: ValidateModuleConfigOptions,
): ModuleConfigValidationResult {
  const stopOnFailure = options?.stopOnFailure ?? true;
  const skipLayers = new Set(options?.skipLayers ?? []);

  const allErrors: ModuleConfigValidationError[] = [];
  const allWarnings: ModuleConfigValidationWarning[] = [];
  const result: ModuleConfigValidationResult = {
    passed: false,
    errors: allErrors,
    warnings: allWarnings,
  };

  if (!skipLayers.has('schema')) {
    const schemaResult = validateSchema(config);
    result.schemaResult = schemaResult;
    allErrors.push(...schemaResult.errors);
    allWarnings.push(...schemaResult.warnings);

    if (!schemaResult.passed) {
      result.failedAtLayer = 'schema';
      if (stopOnFailure) return result;
    } else {
      result.lastPassedLayer = 'schema';
    }
  }

  const validConfig = config as ModuleTestConfig;

  if (!skipLayers.has('semantic')) {
    if (!context) {
      allWarnings.push({ layer: 'semantic', path: '', message: 'ValidationContext not provided, skipping semantic validation' });
    } else {
      const semanticResult = validateSemantic(validConfig, context);
      result.semanticResult = semanticResult;
      allErrors.push(...semanticResult.errors);
      allWarnings.push(...semanticResult.warnings);

      if (!semanticResult.passed) {
        result.failedAtLayer = result.failedAtLayer || 'semantic';
        if (stopOnFailure) return result;
      } else {
        result.lastPassedLayer = 'semantic';
      }
    }
  }

  if (!skipLayers.has('dryrun')) {
    if (!context) {
      allWarnings.push({ layer: 'dryrun', path: '', message: 'ValidationContext not provided, skipping dry-run validation' });
    } else {
      const dryrunResult = validateDryrun(validConfig, context);
      result.dryrunResult = dryrunResult;
      allErrors.push(...dryrunResult.errors);
      allWarnings.push(...dryrunResult.warnings);

      if (!dryrunResult.passed) {
        result.failedAtLayer = result.failedAtLayer || 'dryrun';
      } else {
        result.lastPassedLayer = 'dryrun';
      }
    }
  }

  result.passed = allErrors.length === 0;
  return result;
}

export function formatValidationResult(result: ModuleConfigValidationResult): string {
  const lines: string[] = [];
  lines.push(result.passed ? '\u2705 Validation PASSED' : '\u274c Validation FAILED');
  if (result.failedAtLayer) lines.push(`   Failed at layer: ${result.failedAtLayer}`);
  if (result.lastPassedLayer) lines.push(`   Last passed layer: ${result.lastPassedLayer}`);

  if (result.errors.length > 0) {
    lines.push('', `Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      lines.push(`  [${err.layer}] ${err.path}: ${err.message}`);
      if (err.suggestion) lines.push(`         \ud83d\udca1 ${err.suggestion}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('', `Warnings (${result.warnings.length}):`);
    for (const warn of result.warnings) {
      lines.push(`  [${warn.layer}] ${warn.path}: ${warn.message}`);
    }
  }

  return lines.join('\n');
}
