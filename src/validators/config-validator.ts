import type { ValidationError } from '../types.js';

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
