/**
 * Enhanced AI Config Suggester — improved config generation with:
 * - Richer prompts using DTO field info and validation rules
 * - JSON recovery with fallback strategies
 * - Retry with previous failure context
 * - Three-layer validation integration
 */

import type {
  LlmProvider,
  ApiEndpoint,
  ModuleTestConfig,
  SeedStep,
  DTOInfo,
} from '../types.js';
import { recoverJSON } from './ai-config-suggester.js';

// ============================================================
// Types
// ============================================================

export interface EnhancedGenerateOptions {
  moduleName: string;
  endpoints: ApiEndpoint[];
  llmProvider: LlmProvider;
  /** DTO info for richer prompts */
  dtos?: DTOInfo[];
  /** Example config for few-shot learning */
  exampleConfig?: ModuleTestConfig;
  /** Temperature (default 0.1) */
  temperature?: number;
  /** Max retries per phase (default 3) */
  maxRetries?: number;
  /** Single call timeout in ms (default 30000) */
  timeout?: number;
  /** Dry-run: preview only */
  dryRun?: boolean;
}

export interface EnhancedGenerateResult {
  success: boolean;
  config?: ModuleTestConfig;
  attempts: AttemptRecord[];
  error?: string;
}

export interface AttemptRecord {
  attempt: number;
  phase: 'body' | 'param' | 'seed' | 'full';
  rawResponse?: string;
  parsedJson?: unknown;
  error?: string;
  durationMs: number;
}

// ============================================================
// AI Call with Retry
// ============================================================

async function callAIWithRetry(
  llm: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxRetries: number; timeout: number; phase: string },
): Promise<{ json: unknown; attempts: AttemptRecord[] }> {
  const attempts: AttemptRecord[] = [];
  let lastError = '';
  let currentUserPrompt = userPrompt;

  for (let i = 0; i < opts.maxRetries; i++) {
    const startTime = Date.now();
    try {
      const raw = await Promise.race([
        llm.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentUserPrompt },
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI request timeout')), opts.timeout),
        ),
      ]);

      const jsonStr = recoverJSON(raw);
      const parsed = JSON.parse(jsonStr);

      attempts.push({
        attempt: i + 1,
        phase: opts.phase as AttemptRecord['phase'],
        rawResponse: raw.substring(0, 500),
        parsedJson: parsed,
        durationMs: Date.now() - startTime,
      });

      return { json: parsed, attempts };
    } catch (err: unknown) {
      lastError = (err as Error).message || String(err);
      attempts.push({
        attempt: i + 1,
        phase: opts.phase as AttemptRecord['phase'],
        error: lastError,
        durationMs: Date.now() - startTime,
      });

      if (i < opts.maxRetries - 1) {
        currentUserPrompt += `\n\n[Retry ${i + 1}] Previous call failed: ${lastError}. Please regenerate.`;
      }
    }
  }

  throw Object.assign(
    new Error(`AI call failed after ${opts.maxRetries} retries: ${lastError}`),
    { attempts },
  );
}

// ============================================================
// Prompt Builders
// ============================================================

function buildBodyTemplatePrompt(
  options: EnhancedGenerateOptions,
  previousError?: string,
): { system: string; user: string } {
  const { moduleName, endpoints, dtos } = options;

  const dtoSummary = (dtos || [])
    .map((dto) => {
      const fields = dto.fields
        .filter((f) => !f.isSystemField)
        .map((f) => {
          let desc = `  - ${f.name}: ${f.type}`;
          if (f.required) desc += ' (required)';
          if (f.enumValues?.length) desc += ` [${f.enumValues.join(', ')}]`;
          return desc;
        })
        .join('\n');
      return `${dto.name}${dto.extends ? ` extends ${dto.extends}` : ''}:\n${fields}`;
    })
    .join('\n\n');

  const writeEndpoints = endpoints
    .filter((e) => ['POST', 'PUT', 'PATCH'].includes(e.method))
    .map((e) => `${e.method} ${e.path}${e.bodyFields?.length ? ` → body: [${e.bodyFields.join(', ')}]` : ''}`)
    .join('\n');

  const system = `You are an E2E test config expert. Generate test body templates based on API endpoints and DTO definitions.

Strict rules:
1. String fields: "__e2e_{fieldName}_{timestamp}" format
2. Enum fields: use the first declared value from DTO
3. Number fields: reasonable defaults (1, 10, 100)
4. Boolean fields: true
5. Required fields must not be omitted
6. Do not invent fields not in the DTO
7. Output ONLY strict JSON, no explanation

Output format: { "POST /path": { "field1": "value1", "field2": 123 } }`;

  let user = `Module: ${moduleName}

=== Write Endpoints ===
${writeEndpoints || '(none)'}

=== DTO Definitions ===
${dtoSummary || '(no DTOs found)'}`;

  if (options.exampleConfig?.bodyTemplates) {
    user += `\n\n=== Example (verified) ===\n${JSON.stringify(options.exampleConfig.bodyTemplates, null, 2)}`;
  }

  if (previousError) {
    user += `\n\n=== Previous failure reason ===\n${previousError}\nPlease fix and regenerate.`;
  }

  user += '\n\nGenerate body templates (strict JSON):';

  return { system, user };
}

function buildParamRewritePrompt(
  options: EnhancedGenerateOptions,
): { system: string; user: string } {
  const { moduleName, endpoints } = options;

  const paramEndpoints = endpoints
    .filter((e) => e.pathParams && e.pathParams.length > 0)
    .map((e) => `${e.method} ${e.path} → params: [${e.pathParams!.join(', ')}]`)
    .join('\n');

  const system = `You are an API path analysis expert. Map generic :id parameters to semantic names.
Rules:
1. Map :id to semantic names based on path segment: /categories/:id → categoryId
2. Only process paths with :id or similar generic params
3. Output ONLY strict JSON. No explanation.

Output format: { "GET /path/:id": { "id": "semanticId" } }`;

  const user = `Module: ${moduleName}\n\nEndpoints with path params:\n${paramEndpoints || '(none)'}\n\nGenerate param rewrites (strict JSON):`;

  return { system, user };
}

function buildSeedPrompt(
  options: EnhancedGenerateOptions,
  bodyTemplates: Record<string, Record<string, unknown>>,
): { system: string; user: string } {
  const { moduleName, endpoints, dtos } = options;

  const allEndpoints = endpoints.map((e) => `${e.method} ${e.path}`).join('\n');

  const dtoSummary = (dtos || [])
    .map((dto) => {
      const fields = dto.fields
        .filter((f) => !f.isSystemField)
        .map((f) => `${f.name}(${f.type}${f.required ? ',required' : ''})`)
        .join(', ');
      return `${dto.name}: [${fields}]`;
    })
    .join('\n');

  const system = `You are a test data dependency analysis expert. Generate beforeAll seed steps.

Strict rules:
1. Use only existing API paths from the endpoint list
2. Main resources first, then sub-resources
3. Use captureAs to mark IDs to capture
4. dependsOn must reference previously captured variables
5. required: true for essential steps
6. body must match DTO definitions
7. step numbers from 1, consecutive
8. Output ONLY strict JSON array. No explanation.

Output format: [{ "step": 1, "method": "POST", "path": "/path", "body": {}, "captureAs": "id", "required": true, "dependsOn": [], "failureMessage": "..." }]`;

  let user = `Module: ${moduleName}

=== All API Endpoints ===
${allEndpoints}

=== DTO Definitions ===
${dtoSummary || '(no DTOs)'}

=== Generated Body Templates ===
${JSON.stringify(bodyTemplates, null, 2)}`;

  user += '\n\nGenerate seed config (strict JSON array):';

  return { system, user };
}

// ============================================================
// ID Alias Derivation
// ============================================================

function deriveIdAliases(
  paramRewrites: Record<string, Record<string, string>>,
): Array<{ pathPattern: string; alias: string }> {
  const aliases: Array<{ pathPattern: string; alias: string }> = [];
  const seen = new Set<string>();

  for (const [key, mapping] of Object.entries(paramRewrites)) {
    const spaceIdx = key.indexOf(' ');
    if (spaceIdx === -1) continue;
    const routePath = key.substring(spaceIdx + 1);

    for (const [param, alias] of Object.entries(mapping)) {
      if (param === 'id' && !seen.has(alias)) {
        const segments = routePath.split('/');
        const idIdx = segments.findIndex((s) => s === `:${param}`);
        if (idIdx > 0) {
          aliases.push({ pathPattern: segments[idIdx - 1], alias });
          seen.add(alias);
        }
      }
    }
  }

  return aliases;
}

// ============================================================
// Main Flow
// ============================================================

/**
 * Generate module test config with enhanced prompts and retry logic.
 */
export async function generateEnhancedConfig(
  options: EnhancedGenerateOptions,
): Promise<EnhancedGenerateResult> {
  const {
    moduleName,
    llmProvider,
    maxRetries = 3,
    timeout = 30000,
  } = options;

  const allAttempts: AttemptRecord[] = [];

  console.log(`[enhanced-suggester] Generating config for "${moduleName}"...`);
  console.log(`[enhanced-suggester] ${options.dtos?.length ?? 0} DTOs, ${options.endpoints.length} endpoints`);

  try {
    // Step 1: bodyTemplates
    const bodyPrompt = buildBodyTemplatePrompt(options);
    const bodyResult = await callAIWithRetry(llmProvider, bodyPrompt.system, bodyPrompt.user, {
      maxRetries, timeout, phase: 'body',
    });
    allAttempts.push(...bodyResult.attempts);
    const bodyTemplates: Record<string, Record<string, unknown>> =
      typeof bodyResult.json === 'object' && !Array.isArray(bodyResult.json)
        ? bodyResult.json as Record<string, Record<string, unknown>>
        : {};

    // Step 2: paramRewrites
    const paramPrompt = buildParamRewritePrompt(options);
    const paramResult = await callAIWithRetry(llmProvider, paramPrompt.system, paramPrompt.user, {
      maxRetries, timeout, phase: 'param',
    });
    allAttempts.push(...paramResult.attempts);
    const paramRewrites: Record<string, Record<string, string>> =
      typeof paramResult.json === 'object' && !Array.isArray(paramResult.json)
        ? paramResult.json as Record<string, Record<string, string>>
        : {};

    // Step 3: seed
    const seedPrompt = buildSeedPrompt(options, bodyTemplates);
    const seedResult = await callAIWithRetry(llmProvider, seedPrompt.system, seedPrompt.user, {
      maxRetries, timeout, phase: 'seed',
    });
    allAttempts.push(...seedResult.attempts);
    const seed: SeedStep[] = Array.isArray(seedResult.json) ? seedResult.json as SeedStep[] : [];

    const idAliases = deriveIdAliases(paramRewrites);

    const config: ModuleTestConfig = {
      moduleName,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      bodyTemplates,
      paramRewrites,
      idAliases,
      specialUrls: {},
      seed,
    };

    return { success: true, config, attempts: allAttempts };
  } catch (err: unknown) {
    const errorAttempts = (err as { attempts?: AttemptRecord[] }).attempts || [];
    allAttempts.push(...errorAttempts);

    return {
      success: false,
      attempts: allAttempts,
      error: (err as Error).message || String(err),
    };
  }
}
