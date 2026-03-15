/**
 * Auto-Fixer — automatic config repair based on validation errors.
 *
 * Four fix strategies:
 * 1. InterfacePathMismatchFixer: find the closest matching real route
 * 2. MissingDtoFieldFixer: fill in missing required fields from DTO
 * 3. SeedDependencyOrderFixer: topological sort of seed steps
 * 4. ParamMappingFixer: regenerate paramRewrites from actual routes
 */

import type {
  ModuleTestConfig,
  SeedStep,
  ApiEndpoint,
  DTOFieldInfo,
  FixContext,
  FixHistoryEntry,
  FixResult,
  ModuleConfigValidationError,
  ModuleConfigValidationContext,
} from '../types.js';
import { validateModuleConfig } from '../validators/config-validator.js';

// ============================================================
// Strategy Interface
// ============================================================

interface FixStrategy {
  name: string;
  applies: (error: ModuleConfigValidationError) => boolean;
  fix: (config: ModuleTestConfig, error: ModuleConfigValidationError, context: FixContext) => ModuleTestConfig;
  priority: number;
}

// ============================================================
// Utils
// ============================================================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function pathSimilarity(a: string, b: string): number {
  const segA = a.split('/').filter(Boolean);
  const segB = b.split('/').filter(Boolean);
  let matches = 0;
  const maxLen = Math.max(segA.length, segB.length);
  if (maxLen === 0) return 1;
  for (let i = 0; i < Math.min(segA.length, segB.length); i++) {
    if (segA[i] === segB[i]) matches++;
    else if (segA[i].startsWith(':') || segB[i].startsWith(':')) matches += 0.5;
  }
  return matches / maxLen;
}

function findMostSimilarEndpoint(method: string, brokenPath: string, endpoints: ApiEndpoint[]): ApiEndpoint | undefined {
  const sameMethod = endpoints.filter((e) => e.method === method);
  let bestScore = 0;
  let bestMatch: ApiEndpoint | undefined;
  for (const ep of sameMethod) {
    const score = pathSimilarity(brokenPath, ep.path);
    if (score > bestScore) { bestScore = score; bestMatch = ep; }
  }
  return bestScore >= 0.5 ? bestMatch : undefined;
}

function segmentToIdName(segment: string): string {
  let clean = segment.replace(/^aigc-/, '');
  const parts = clean.split('-');
  if (parts.length === 1) return parts[0].replace(/s$/, '') + 'Id';
  return parts.map((p) => p[0]).join('') + 'Id';
}

function generateDefaultValue(field: DTOFieldInfo): unknown {
  if (field.enumValues?.length) return field.enumValues[0];
  switch (field.type.toLowerCase()) {
    case 'string': return `__e2e_${field.name}_${Date.now()}`;
    case 'number': return 1;
    case 'boolean': return true;
    case 'date': return new Date().toISOString();
    default:
      if (field.type.includes('[]') || field.type.includes('Array')) return [];
      return `__e2e_${field.name}`;
  }
}

function detectChangedKeys(before: ModuleTestConfig, after: ModuleTestConfig): string[] {
  const keys: string[] = [];
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of allKeys) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      keys.push(key);
    }
  }
  return keys;
}

// ============================================================
// Strategy 1: InterfacePathMismatchFixer
// ============================================================

const interfacePathMismatchFixer: FixStrategy = {
  name: 'InterfacePathMismatchFixer',
  priority: 100,
  applies: (error) => error.type === 'interface-not-found' || error.type === 'param-mapping-invalid',
  fix: (config, error, context) => {
    const fixed = deepClone(config);
    const match = error.message.match(/['"]?(GET|POST|PUT|DELETE|PATCH)\s+([^'"]+)['"]?/);
    if (!match) return fixed;

    const [, method, brokenPath] = match;
    const bestMatch = findMostSimilarEndpoint(method, brokenPath, context.endpoints);
    if (!bestMatch) return fixed;

    const oldKey = `${method} ${brokenPath}`;
    const newKey = `${method} ${bestMatch.path}`;

    if (error.path.startsWith('bodyTemplates') && fixed.bodyTemplates[oldKey]) {
      fixed.bodyTemplates[newKey] = fixed.bodyTemplates[oldKey];
      delete fixed.bodyTemplates[oldKey];
    }
    if (error.path.startsWith('paramRewrites') && fixed.paramRewrites[oldKey]) {
      fixed.paramRewrites[newKey] = fixed.paramRewrites[oldKey];
      delete fixed.paramRewrites[oldKey];
    }
    if (error.path.startsWith('seed')) {
      for (const step of fixed.seed) {
        if (step.method === method && step.path === brokenPath) {
          step.path = bestMatch.path;
        }
      }
    }
    return fixed;
  },
};

// ============================================================
// Strategy 2: MissingDtoFieldFixer
// ============================================================

const missingDtoFieldFixer: FixStrategy = {
  name: 'MissingDtoFieldFixer',
  priority: 90,
  applies: (error) => error.type === 'field-missing' || (error.type === 'missing-field' && error.path.startsWith('bodyTemplates')),
  fix: (config, error, context) => {
    const fixed = deepClone(config);
    const fieldMatch = error.message.match(/field '(\w+)'/);
    if (!fieldMatch) return fixed;
    const missingField = fieldMatch[1];

    const dtoMatch = error.message.match(/from (\w+)/);
    const dto = dtoMatch ? context.dtos.find((d) => d.name === dtoMatch[1]) : context.dtos[0];
    if (!dto) return fixed;

    const fieldDef = dto.fields.find((f) => f.name === missingField);
    if (!fieldDef) return fixed;

    const defaultValue = generateDefaultValue(fieldDef);

    for (const [key, body] of Object.entries(fixed.bodyTemplates)) {
      const method = key.split(' ')[0];
      if (['POST', 'PUT', 'PATCH'].includes(method) && !(missingField in body)) {
        (body as Record<string, unknown>)[missingField] = defaultValue;
      }
    }
    return fixed;
  },
};

// ============================================================
// Strategy 3: SeedDependencyOrderFixer
// ============================================================

const seedDependencyOrderFixer: FixStrategy = {
  name: 'SeedDependencyOrderFixer',
  priority: 80,
  applies: (error) => error.type === 'dependency-missing' || error.type === 'dependency-cycle' || error.type === 'seed-order-invalid',
  fix: (config) => {
    const fixed = deepClone(config);
    if (!fixed.seed || fixed.seed.length === 0) return fixed;

    const sorted = topologicalSortSeed(fixed.seed);
    if (sorted) fixed.seed = sorted;
    return fixed;
  },
};

function topologicalSortSeed(seed: SeedStep[]): SeedStep[] | null {
  const captureToStep = new Map<string, SeedStep>();
  for (const step of seed) {
    if (step.captureAs) captureToStep.set(step.captureAs, step);
  }

  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();
  for (const step of seed) {
    inDegree.set(step.step, 0);
    adj.set(step.step, []);
  }

  for (const step of seed) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        const depStep = captureToStep.get(dep);
        if (depStep) {
          adj.get(depStep.step)?.push(step.step);
          inDegree.set(step.step, (inDegree.get(step.step) || 0) + 1);
        }
      }
    }
  }

  const queue: number[] = [];
  for (const [stepNum, degree] of inDegree) {
    if (degree === 0) queue.push(stepNum);
  }

  const sorted: SeedStep[] = [];
  const stepMap = new Map(seed.map((s) => [s.step, s]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = stepMap.get(current);
    if (step) sorted.push(step);
    for (const next of adj.get(current) || []) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  if (sorted.length !== seed.length) return null; // has cycle
  return sorted.map((s, i) => ({ ...s, step: i + 1 }));
}

// ============================================================
// Strategy 4: ParamMappingFixer
// ============================================================

const paramMappingFixer: FixStrategy = {
  name: 'ParamMappingFixer',
  priority: 70,
  applies: (error) => error.type === 'param-mapping-invalid',
  fix: (config, _error, context) => {
    const fixed = deepClone(config);
    const newRewrites: Record<string, Record<string, string>> = {};

    for (const ep of context.endpoints) {
      if (!ep.pathParams || ep.pathParams.length === 0) continue;
      const key = `${ep.method} ${ep.path}`;
      const mapping: Record<string, string> = {};

      for (const param of ep.pathParams) {
        if (param === 'id') {
          const segments = ep.path.split('/');
          const idIdx = segments.indexOf(':id');
          if (idIdx > 0) {
            mapping[param] = segmentToIdName(segments[idIdx - 1]);
          }
        }
      }
      if (Object.keys(mapping).length > 0) newRewrites[key] = mapping;
    }

    fixed.paramRewrites = newRewrites;
    return fixed;
  },
};

// ============================================================
// Strategy Registry (sorted by priority desc)
// ============================================================

const ALL_STRATEGIES: FixStrategy[] = [
  interfacePathMismatchFixer,
  missingDtoFieldFixer,
  seedDependencyOrderFixer,
  paramMappingFixer,
].sort((a, b) => b.priority - a.priority);

// ============================================================
// Main Fix Flow
// ============================================================

/**
 * Run automatic fix loop on a module test config.
 */
export function autoFix(
  config: ModuleTestConfig,
  initialErrors: ModuleConfigValidationError[],
  context: FixContext,
  validationContext?: ModuleConfigValidationContext,
  maxAttempts = 3,
): FixResult {
  const history: FixHistoryEntry[] = [];
  let currentConfig = deepClone(config);
  let currentErrors = initialErrors.filter((e) => e.layer !== 'dryrun');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (currentErrors.length === 0) break;

    let fixApplied = false;

    for (const error of [...currentErrors]) {
      const strategy = ALL_STRATEGIES.find((s) => s.applies(error));
      if (!strategy) continue;

      const before = currentConfig;
      currentConfig = strategy.fix(currentConfig, error, context);
      fixApplied = true;

      history.push({
        timestamp: new Date().toISOString(),
        attempt,
        errorType: error.type,
        errorPath: error.path,
        errorMessage: error.message,
        fixerUsed: strategy.name,
        changedKeys: detectChangedKeys(before, currentConfig),
        validationPassedAfterFix: false,
      });
    }

    if (!fixApplied) break;

    // Re-validate
    const revalidation = validateModuleConfig(
      currentConfig,
      validationContext,
      { skipLayers: ['dryrun'] },
    );
    currentErrors = revalidation.errors;

    if (history.length > 0) {
      history[history.length - 1].validationPassedAfterFix = currentErrors.length === 0;
    }

    if (currentErrors.length === 0) break;
  }

  return {
    success: currentErrors.length === 0,
    config: currentConfig,
    totalAttempts: history.length,
    history,
    remainingErrors: currentErrors,
  };
}
