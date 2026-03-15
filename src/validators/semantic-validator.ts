/**
 * Semantic Validator — Layer 2 of three-layer module config validation.
 * Checks that config matches actual source code (routes, DTO fields, dependencies).
 */

import type {
  ModuleTestConfig,
  SeedStep,
  ApiEndpoint,
  DTOInfo,
  ModuleConfigValidationContext,
  LayerValidationResult,
  ModuleConfigValidationError,
  ModuleConfigValidationWarning,
} from '../types.js';

export function validateSemantic(
  config: ModuleTestConfig,
  context: ModuleConfigValidationContext,
): LayerValidationResult {
  const errors: ModuleConfigValidationError[] = [];
  const warnings: ModuleConfigValidationWarning[] = [];

  validateBodyTemplatesSemantic(config, context, errors, warnings);
  validateParamRewritesSemantic(config, context, errors, warnings);
  validateIdAliasesSemantic(config, context, warnings);
  validateSeedRoutesSemantic(config, context, errors);
  validateSeedDependenciesSemantic(config, errors, warnings);

  return { passed: errors.length === 0, layer: 'semantic', errors, warnings };
}

// ============================================================
// Helpers
// ============================================================

function normalizePath(p: string): string {
  return p.replace(/\/+$/, '').replace(/\/+/g, '/');
}

function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  const regex = /:(\w+)/g;
  let match;
  while ((match = regex.exec(routePath)) !== null) params.push(match[1]);
  return params;
}

function findMatchingEndpoint(
  method: string, configPath: string, endpoints: ApiEndpoint[],
): ApiEndpoint | undefined {
  const normalized = normalizePath(configPath);
  return endpoints.find((ep) => {
    if (ep.method !== method.toUpperCase()) return false;
    const epNorm = normalizePath(ep.path);
    if (epNorm === normalized) return true;
    const cSegs = normalized.split('/');
    const eSegs = epNorm.split('/');
    if (cSegs.length !== eSegs.length) return false;
    return cSegs.every((seg, idx) => seg === eSegs[idx] || seg.startsWith(':') || eSegs[idx].startsWith(':'));
  });
}

function findMatchingDTO(method: string, dtos: DTOInfo[]): DTOInfo | undefined {
  if (dtos.length === 0) return undefined;
  if (['POST'].includes(method)) return dtos.find((d) => /Create|Input|Request/.test(d.name));
  if (['PUT', 'PATCH'].includes(method)) return dtos.find((d) => /Update/.test(d.name)) || dtos.find((d) => /Create|Input/.test(d.name));
  if (['GET'].includes(method)) return dtos.find((d) => /Query|List|Params/.test(d.name));
  return undefined;
}

// ============================================================
// Validators
// ============================================================

function validateBodyTemplatesSemantic(
  config: ModuleTestConfig,
  ctx: ModuleConfigValidationContext,
  errors: ModuleConfigValidationError[],
  warnings: ModuleConfigValidationWarning[],
): void {
  for (const [key, body] of Object.entries(config.bodyTemplates)) {
    const p = `bodyTemplates.${key}`;
    const spaceIdx = key.indexOf(' ');
    if (spaceIdx === -1) continue;

    const method = key.substring(0, spaceIdx).toUpperCase();
    const routePath = key.substring(spaceIdx + 1);

    const endpoint = findMatchingEndpoint(method, routePath, ctx.endpoints);
    if (!endpoint) {
      errors.push({
        layer: 'semantic', type: 'interface-not-found', path: p,
        message: `Route '${method} ${routePath}' in bodyTemplates does not match any parsed API endpoint`,
        suggestion: `Check that the controller defines ${method} ${routePath}`,
      });
      continue;
    }

    const bodyFields = Object.keys(body);
    if (bodyFields.length === 0) continue;

    const dto = findMatchingDTO(method, ctx.dtos);
    if (!dto) {
      warnings.push({ layer: 'semantic', path: p, message: `No matching DTO found for '${method} ${routePath}', cannot verify field completeness` });
      continue;
    }

    const dtoFieldNames = new Set(dto.fields.map((f) => f.name));
    for (const fieldName of bodyFields) {
      if (!dtoFieldNames.has(fieldName)) {
        warnings.push({ layer: 'semantic', path: `${p}.${fieldName}`, message: `Field '${fieldName}' in body template not found in DTO '${dto.name}'` });
      }
    }

    const bodyFieldSet = new Set(bodyFields);
    for (const field of dto.fields) {
      if (field.required && !field.isSystemField && !bodyFieldSet.has(field.name)) {
        warnings.push({ layer: 'semantic', path: p, message: `Required DTO field '${field.name}' (from ${dto.name}) not present in body template` });
      }
    }
  }
}

function validateParamRewritesSemantic(
  config: ModuleTestConfig,
  ctx: ModuleConfigValidationContext,
  errors: ModuleConfigValidationError[],
  warnings: ModuleConfigValidationWarning[],
): void {
  for (const [key, mapping] of Object.entries(config.paramRewrites)) {
    const p = `paramRewrites.${key}`;
    const spaceIdx = key.indexOf(' ');
    if (spaceIdx === -1) continue;

    const method = key.substring(0, spaceIdx).toUpperCase();
    const routePath = key.substring(spaceIdx + 1);

    const endpoint = findMatchingEndpoint(method, routePath, ctx.endpoints);
    if (!endpoint) {
      errors.push({ layer: 'semantic', type: 'param-mapping-invalid', path: p, message: `Route '${method} ${routePath}' in paramRewrites does not match any parsed API endpoint` });
      continue;
    }

    const actualParams = new Set(extractPathParams(endpoint.path));
    for (const paramName of Object.keys(mapping)) {
      if (!actualParams.has(paramName)) {
        warnings.push({ layer: 'semantic', path: `${p}.${paramName}`, message: `Param '${paramName}' in paramRewrites not found in route path params [${[...actualParams].join(', ')}]` });
      }
    }
  }
}

function validateIdAliasesSemantic(
  config: ModuleTestConfig,
  ctx: ModuleConfigValidationContext,
  warnings: ModuleConfigValidationWarning[],
): void {
  for (let i = 0; i < config.idAliases.length; i++) {
    const alias = config.idAliases[i];
    const matched = ctx.endpoints.some((ep) => {
      try { return new RegExp(alias.pathPattern).test(ep.path); } catch { return ep.path.includes(alias.pathPattern); }
    });
    if (!matched) {
      warnings.push({ layer: 'semantic', path: `idAliases[${i}].pathPattern`, message: `idAlias pathPattern '${alias.pathPattern}' does not match any known API route` });
    }
  }
}

function validateSeedRoutesSemantic(
  config: ModuleTestConfig,
  ctx: ModuleConfigValidationContext,
  errors: ModuleConfigValidationError[],
): void {
  for (let i = 0; i < config.seed.length; i++) {
    const step = config.seed[i];
    const endpoint = findMatchingEndpoint(step.method, step.path, ctx.endpoints);
    if (!endpoint) {
      errors.push({
        layer: 'semantic', type: 'interface-not-found', path: `seed[${i}].path`,
        message: `Seed step ${step.step}: route '${step.method} ${step.path}' does not match any parsed API endpoint`,
        suggestion: `Verify that '${step.method} ${step.path}' exists in the module controllers`,
      });
    }
  }
}

function validateSeedDependenciesSemantic(
  config: ModuleTestConfig,
  errors: ModuleConfigValidationError[],
  warnings: ModuleConfigValidationWarning[],
): void {
  if (config.seed.length === 0) return;

  const capturedSet = new Set<string>();
  const variablePattern = /\{\{(\w+)\}\}|\$\{(\w+)\}/g;

  for (let i = 0; i < config.seed.length; i++) {
    const step = config.seed[i];

    // Check body variable references
    if (step.body) {
      const bodyStr = JSON.stringify(step.body);
      variablePattern.lastIndex = 0;
      let match;
      while ((match = variablePattern.exec(bodyStr)) !== null) {
        const varName = match[1] || match[2];
        if (!capturedSet.has(varName)) {
          warnings.push({ layer: 'semantic', path: `seed[${i}].body`, message: `Body references variable '${varName}' which may not be captured by a preceding seed step` });
        }
      }
    }

    // Check path variable references
    if (step.path) {
      variablePattern.lastIndex = 0;
      let match;
      while ((match = variablePattern.exec(step.path)) !== null) {
        const varName = match[1] || match[2];
        if (!capturedSet.has(varName)) {
          warnings.push({ layer: 'semantic', path: `seed[${i}].path`, message: `Path references variable '${varName}' which may not be captured by a preceding seed step` });
        }
      }
    }

    if (step.captureAs) capturedSet.add(step.captureAs);
  }

  // Cycle detection via DFS
  detectDependencyCycle(config.seed, errors);
}

function detectDependencyCycle(seed: SeedStep[], errors: ModuleConfigValidationError[]): void {
  const graph = new Map<string, string[]>();
  for (const step of seed) {
    if (step.captureAs) {
      graph.set(step.captureAs, step.dependsOn || []);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of graph.get(node) || []) {
      if (dfs(neighbor)) {
        errors.push({ layer: 'semantic', type: 'dependency-cycle', path: 'seed', message: `Circular dependency detected involving '${node}' → '${neighbor}'` });
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }
}
