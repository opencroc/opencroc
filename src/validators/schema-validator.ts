/**
 * Schema Validator — Layer 1 of three-layer module config validation.
 * Checks structural integrity, field types, format conventions.
 */

import type {
  LayerValidationResult,
  ModuleConfigValidationError,
  ModuleConfigValidationWarning,
} from '../types.js';

const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export function validateSchema(config: unknown): LayerValidationResult {
  const errors: ModuleConfigValidationError[] = [];
  const warnings: ModuleConfigValidationWarning[] = [];

  if (config === null || config === undefined || typeof config !== 'object') {
    errors.push({ layer: 'schema', type: 'invalid-type', path: '', message: 'Config must be a non-null object' });
    return { passed: false, layer: 'schema', errors, warnings };
  }

  const cfg = config as Record<string, unknown>;

  // Required top-level fields
  const required: Array<{ name: string; type: string }> = [
    { name: 'moduleName', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'generatedAt', type: 'string' },
    { name: 'bodyTemplates', type: 'object' },
    { name: 'paramRewrites', type: 'object' },
    { name: 'idAliases', type: 'array' },
    { name: 'seed', type: 'array' },
  ];

  for (const f of required) {
    if (cfg[f.name] === undefined || cfg[f.name] === null) {
      errors.push({
        layer: 'schema', type: 'missing-field', path: f.name,
        message: `Required field '${f.name}' is missing`,
        suggestion: `Add '${f.name}' field of type ${f.type}`,
      });
    }
  }

  // Field type checks
  validateFieldTypes(cfg, errors);

  // bodyTemplates structure
  if (cfg.bodyTemplates && typeof cfg.bodyTemplates === 'object' && !Array.isArray(cfg.bodyTemplates)) {
    validateBodyTemplates(cfg.bodyTemplates as Record<string, unknown>, errors, warnings);
  }

  // paramRewrites structure
  if (cfg.paramRewrites && typeof cfg.paramRewrites === 'object' && !Array.isArray(cfg.paramRewrites)) {
    validateParamRewrites(cfg.paramRewrites as Record<string, unknown>, errors, warnings);
  }

  // idAliases structure
  if (Array.isArray(cfg.idAliases)) {
    validateIdAliases(cfg.idAliases, errors);
  }

  // seed array
  if (Array.isArray(cfg.seed)) {
    validateSeedArray(cfg.seed, errors, warnings);
  }

  // version format
  if (typeof cfg.version === 'string' && !/^\d+\.\d+(\.\d+)?$/.test(cfg.version)) {
    warnings.push({ layer: 'schema', path: 'version', message: `Version '${cfg.version}' does not follow semver format` });
  }

  return { passed: errors.length === 0, layer: 'schema', errors, warnings };
}

function validateFieldTypes(cfg: Record<string, unknown>, errors: ModuleConfigValidationError[]): void {
  if (cfg.moduleName !== undefined && typeof cfg.moduleName !== 'string') {
    errors.push({ layer: 'schema', type: 'invalid-type', path: 'moduleName', message: `'moduleName' must be a string` });
  } else if (typeof cfg.moduleName === 'string' && cfg.moduleName.trim() === '') {
    errors.push({ layer: 'schema', type: 'invalid-format', path: 'moduleName', message: "'moduleName' must not be empty" });
  }

  if (cfg.bodyTemplates !== undefined && (typeof cfg.bodyTemplates !== 'object' || Array.isArray(cfg.bodyTemplates))) {
    errors.push({ layer: 'schema', type: 'invalid-type', path: 'bodyTemplates', message: "'bodyTemplates' must be a plain object" });
  }
  if (cfg.paramRewrites !== undefined && (typeof cfg.paramRewrites !== 'object' || Array.isArray(cfg.paramRewrites))) {
    errors.push({ layer: 'schema', type: 'invalid-type', path: 'paramRewrites', message: "'paramRewrites' must be a plain object" });
  }
  if (cfg.idAliases !== undefined && !Array.isArray(cfg.idAliases)) {
    errors.push({ layer: 'schema', type: 'invalid-type', path: 'idAliases', message: "'idAliases' must be an array" });
  }
  if (cfg.seed !== undefined && !Array.isArray(cfg.seed)) {
    errors.push({ layer: 'schema', type: 'invalid-type', path: 'seed', message: "'seed' must be an array" });
  }
}

function validateBodyTemplates(
  templates: Record<string, unknown>,
  errors: ModuleConfigValidationError[],
  warnings: ModuleConfigValidationWarning[],
): void {
  for (const [key, value] of Object.entries(templates)) {
    const p = `bodyTemplates.${key}`;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: p, message: `Body template '${key}' must be a plain object` });
      continue;
    }
    if (!/^(GET|POST|PUT|PATCH|DELETE)\s+\//.test(key)) {
      warnings.push({ layer: 'schema', path: p, message: `Body template key '${key}' should follow format 'METHOD /path'` });
    }
    if (Object.keys(value).length === 0) {
      warnings.push({ layer: 'schema', path: p, message: `Body template '${key}' is empty` });
    }
  }
}

function validateParamRewrites(
  rewrites: Record<string, unknown>,
  errors: ModuleConfigValidationError[],
  _warnings: ModuleConfigValidationWarning[],
): void {
  for (const [key, value] of Object.entries(rewrites)) {
    const p = `paramRewrites.${key}`;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: p, message: `Param rewrite '${key}' must be a plain object` });
      continue;
    }
    for (const [paramName, paramValue] of Object.entries(value as Record<string, unknown>)) {
      if (typeof paramValue !== 'string') {
        errors.push({ layer: 'schema', type: 'invalid-type', path: `${p}.${paramName}`, message: `Param rewrite value for '${paramName}' must be a string` });
      }
    }
  }
}

function validateIdAliases(aliases: unknown[], errors: ModuleConfigValidationError[]): void {
  for (let i = 0; i < aliases.length; i++) {
    const alias = aliases[i] as Record<string, unknown> | null;
    const p = `idAliases[${i}]`;
    if (typeof alias !== 'object' || alias === null) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: p, message: `idAlias at index ${i} must be an object` });
      continue;
    }
    if (typeof alias.pathPattern !== 'string') {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.pathPattern`, message: `idAlias at index ${i} must have a string 'pathPattern'` });
    }
    if (typeof alias.alias !== 'string') {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.alias`, message: `idAlias at index ${i} must have a string 'alias'` });
    }
  }
}

function validateSeedArray(
  seed: unknown[],
  errors: ModuleConfigValidationError[],
  warnings: ModuleConfigValidationWarning[],
): void {
  if (seed.length === 0) {
    warnings.push({ layer: 'schema', path: 'seed', message: 'Seed array is empty, no setup steps will be executed' });
    return;
  }

  const capturedVars = new Set<string>();
  const stepNumbers = new Set<number>();

  for (let i = 0; i < seed.length; i++) {
    const step = seed[i] as Record<string, unknown> | null;
    const p = `seed[${i}]`;
    if (typeof step !== 'object' || step === null) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: p, message: `Seed step at index ${i} must be an object` });
      continue;
    }

    // step number
    if (step.step === undefined) {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.step`, message: `Seed step at index ${i} is missing 'step' number` });
    } else if (typeof step.step !== 'number' || !Number.isInteger(step.step)) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: `${p}.step`, message: `'step' must be an integer` });
    } else {
      if (stepNumbers.has(step.step)) {
        errors.push({ layer: 'schema', type: 'invalid-format', path: `${p}.step`, message: `Duplicate step number ${step.step}` });
      }
      stepNumbers.add(step.step);
    }

    // method
    if (step.method === undefined) {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.method`, message: `Seed step at index ${i} is missing 'method'` });
    } else if (typeof step.method !== 'string' || !(VALID_HTTP_METHODS as readonly string[]).includes(step.method)) {
      errors.push({ layer: 'schema', type: 'invalid-format', path: `${p}.method`, message: `'method' must be one of ${VALID_HTTP_METHODS.join(', ')}` });
    }

    // path
    if (step.path === undefined) {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.path`, message: `Seed step at index ${i} is missing 'path'` });
    } else if (typeof step.path !== 'string' || !(step.path as string).startsWith('/')) {
      errors.push({ layer: 'schema', type: 'invalid-format', path: `${p}.path`, message: `'path' must start with '/'` });
    }

    // required
    if (step.required === undefined) {
      errors.push({ layer: 'schema', type: 'missing-field', path: `${p}.required`, message: `Seed step at index ${i} is missing 'required'` });
    }

    // body
    if (step.body !== undefined && (typeof step.body !== 'object' || step.body === null || Array.isArray(step.body))) {
      errors.push({ layer: 'schema', type: 'invalid-type', path: `${p}.body`, message: `'body' must be a plain object` });
    } else if (step.body === undefined && typeof step.method === 'string' && ['POST', 'PUT', 'PATCH'].includes(step.method)) {
      warnings.push({ layer: 'schema', path: `${p}.body`, message: `${step.method} step at index ${i} has no body template` });
    }

    // captureAs uniqueness
    if (typeof step.captureAs === 'string') {
      if (capturedVars.has(step.captureAs)) {
        errors.push({ layer: 'schema', type: 'invalid-format', path: `${p}.captureAs`, message: `Duplicate captureAs variable '${step.captureAs}'` });
      }
      capturedVars.add(step.captureAs);
    }

    // dependsOn reference check
    if (Array.isArray(step.dependsOn)) {
      for (const dep of step.dependsOn) {
        if (typeof dep === 'string' && !capturedVars.has(dep)) {
          errors.push({
            layer: 'schema', type: 'dependency-missing', path: `${p}.dependsOn`,
            message: `Seed step ${step.step ?? i} depends on '${dep}' not captured by any preceding step`,
            suggestion: `Ensure a preceding step has captureAs: '${dep}'`,
          });
        }
      }
    }
  }
}
