/**
 * AI Config Suggester — AI-driven module test config generation.
 *
 * Uses LlmProvider to analyze parsed API endpoints and generate:
 * - bodyTemplates (request body for POST/PUT/PATCH endpoints)
 * - paramRewrites (semantic parameter name mapping)
 * - seed steps (data setup sequence with dependency ordering)
 */

import type {
  LlmProvider,
  ApiEndpoint,
  ModuleTestConfig,
  SeedStep,
  ModuleConfigValidationContext,
} from '../types.js';
import { validateModuleConfig } from '../validators/config-validator.js';

// ============================================================
// Types
// ============================================================

export interface GenerateConfigOptions {
  moduleName: string;
  endpoints: ApiEndpoint[];
  llmProvider: LlmProvider;
  /** Max validation+fix retries (default 3) */
  maxRetries?: number;
  /** Dry-run: don't write to disk */
  dryRun?: boolean;
  /** Validation context for semantic checking */
  validationContext?: ModuleConfigValidationContext;
}

export interface GenerateConfigResult {
  success: boolean;
  config?: ModuleTestConfig;
  error?: string;
  retries: number;
}

// ============================================================
// JSON Recovery
// ============================================================

export function recoverJSON(text: string): string {
  // Direct parse
  try { JSON.parse(text.trim()); return text.trim(); } catch {}

  // Markdown code block
  const codeBlock = text.match(/```(?:json|javascript|ts)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) {
    try { JSON.parse(codeBlock[1].trim()); return codeBlock[1].trim(); } catch {}
  }

  // Extract outermost {} or []
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  const bracketStart = text.indexOf('[');
  const bracketEnd = text.lastIndexOf(']');

  const tryParse = (start: number, end: number): string | null => {
    if (start === -1 || end <= start) return null;
    let candidate = text.slice(start, end + 1);
    candidate = candidate.replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(candidate); return candidate; } catch { return null; }
  };

  // Try [] first if it appears earlier
  if (bracketStart !== -1 && (braceStart === -1 || bracketStart < braceStart)) {
    const r = tryParse(bracketStart, bracketEnd) ?? tryParse(braceStart, braceEnd);
    if (r) return r;
  } else {
    const r = tryParse(braceStart, braceEnd) ?? tryParse(bracketStart, bracketEnd);
    if (r) return r;
  }

  // Fix trailing commas + unquoted keys + single quotes
  let cleaned = text.trim()
    .replace(/^```(?:json|javascript|ts)?\s*\n?/m, '')
    .replace(/\n?\s*```\s*$/m, '')
    .trim()
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)(\w+)\s*:/g, (_m, prefix, key) => `${prefix}"${key}":`)
    .replace(/'/g, '"');

  try { JSON.parse(cleaned); return cleaned; } catch {}

  throw new Error('JSON recovery failed: unable to extract valid JSON from AI response');
}

// ============================================================
// LLM Prompt Helpers
// ============================================================

async function llmChat(llm: LlmProvider, system: string, user: string): Promise<string> {
  return llm.chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}

async function generateBodyTemplates(
  moduleName: string,
  endpoints: ApiEndpoint[],
  llm: LlmProvider,
): Promise<Record<string, Record<string, unknown>>> {
  const writeEndpoints = endpoints
    .filter((e) => ['POST', 'PUT', 'PATCH'].includes(e.method))
    .map((e) => `${e.method} ${e.path}${e.bodyFields?.length ? ` → [${e.bodyFields.join(', ')}]` : ''}`)
    .join('\n');

  if (!writeEndpoints) return {};

  const system = `You are a test config expert. Generate test body templates for API endpoints.
Rules:
1. String fields: "__e2e_{fieldName}_{timestamp}" format
2. Enum fields: choose a reasonable value
3. Number fields: use reasonable defaults
4. Boolean fields: default true
5. Only return valid JSON object. No explanation.

Output format: { "POST /path": { "field1": "value1" } }`;

  const user = `Module: ${moduleName}\n\nWrite endpoints:\n${writeEndpoints}\n\nGenerate body templates (JSON):`;

  try {
    const raw = await llmChat(llm, system, user);
    return JSON.parse(recoverJSON(raw));
  } catch {
    return {};
  }
}

async function generateParamRewrites(
  moduleName: string,
  endpoints: ApiEndpoint[],
  llm: LlmProvider,
): Promise<Record<string, Record<string, string>>> {
  const paramEndpoints = endpoints
    .filter((e) => e.pathParams && e.pathParams.length > 0)
    .map((e) => `${e.method} ${e.path} → params: [${e.pathParams!.join(', ')}]`)
    .join('\n');

  if (!paramEndpoints) return {};

  const system = `You are an API path analysis expert. Map generic :id parameters to semantic names.
Rules:
1. Map generic :id to semantic names based on the preceding path segment
2. /categories/:id → categoryId, /users/:id → userId
3. Only return valid JSON object. No explanation.

Output format: { "GET /path/:id": { "id": "semanticId" } }`;

  const user = `Module: ${moduleName}\n\nEndpoints with path params:\n${paramEndpoints}\n\nGenerate param rewrites (JSON):`;

  try {
    const raw = await llmChat(llm, system, user);
    return JSON.parse(recoverJSON(raw));
  } catch {
    return {};
  }
}

async function generateSeedConfig(
  moduleName: string,
  endpoints: ApiEndpoint[],
  bodyTemplates: Record<string, Record<string, unknown>>,
  llm: LlmProvider,
): Promise<SeedStep[]> {
  const allEndpoints = endpoints.map((e) => `${e.method} ${e.path}`).join('\n');

  const system = `You are a test data dependency analysis expert. Generate beforeAll seed steps.
Rules:
1. Use only existing API paths from the endpoint list
2. Main resources must be created before sub-resources
3. Use captureAs to mark IDs to capture (e.g. "kbId")
4. dependsOn must reference previously captured variables
5. required: true for essential steps
6. step numbers start from 1
7. Only return valid JSON array. No explanation.

Output format: [{ "step": 1, "method": "POST", "path": "/path", "body": {}, "captureAs": "id", "required": true, "dependsOn": [] }]`;

  const user = `Module: ${moduleName}\n\nAPI endpoints:\n${allEndpoints}\n\nBody templates:\n${JSON.stringify(bodyTemplates, null, 2)}\n\nGenerate seed config (JSON array):`;

  try {
    const raw = await llmChat(llm, system, user);
    const parsed = JSON.parse(recoverJSON(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================
// Config Validation + AI Fix
// ============================================================

interface InternalValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function internalValidate(config: ModuleTestConfig): InternalValidationResult {
  const result = validateModuleConfig(config, undefined, { skipLayers: ['semantic', 'dryrun'] });
  return {
    valid: result.passed,
    errors: result.errors.map((e) => `[${e.path}] ${e.message}`),
    warnings: result.warnings.map((w) => `[${w.path}] ${w.message}`),
  };
}

async function fixConfigErrors(
  config: ModuleTestConfig,
  validation: InternalValidationResult,
  llm: LlmProvider,
): Promise<ModuleTestConfig> {
  if (validation.valid) return config;

  const system = `You are a config repair expert. Fix the validation errors in this config.
Rules:
1. Fix all listed errors
2. Keep the overall structure intact
3. Only return the fixed complete config as JSON. No explanation.`;

  const user = `Original config:\n${JSON.stringify(config, null, 2)}\n\nErrors:\n${validation.errors.join('\n')}\n\nFix and return complete JSON:`;

  try {
    const raw = await llmChat(llm, system, user);
    return JSON.parse(recoverJSON(raw));
  } catch {
    return config;
  }
}

// ============================================================
// Main Flow
// ============================================================

/**
 * Generate a module test config using AI analysis of endpoints.
 */
export async function generateModuleConfig(
  options: GenerateConfigOptions,
): Promise<GenerateConfigResult> {
  const { moduleName, endpoints, llmProvider, maxRetries = 3 } = options;
  let retries = 0;

  console.log(`[ai-config-suggester] Generating config for "${moduleName}"...`);

  if (endpoints.length === 0) {
    return { success: false, error: `No endpoints found for module: ${moduleName}`, retries: 0 };
  }

  // AI generation
  const bodyTemplates = await generateBodyTemplates(moduleName, endpoints, llmProvider);
  const paramRewrites = await generateParamRewrites(moduleName, endpoints, llmProvider);
  const seed = await generateSeedConfig(moduleName, endpoints, bodyTemplates, llmProvider);

  let config: ModuleTestConfig = {
    moduleName,
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    bodyTemplates,
    paramRewrites,
    idAliases: [],
    specialUrls: {},
    seed,
  };

  // Validation + fix loop
  while (retries < maxRetries) {
    const validation = internalValidate(config);
    if (validation.valid) {
      console.log(`[ai-config-suggester] ✓ Config validated`);
      return { success: true, config, retries };
    }

    console.warn(`[ai-config-suggester] Validation failed (attempt ${retries + 1}), fixing...`);
    config = await fixConfigErrors(config, validation, llmProvider);
    retries++;
  }

  return {
    success: false,
    config,
    error: `Config validation failed after ${maxRetries} retries`,
    retries,
  };
}

/**
 * Batch generate configs for multiple modules.
 */
export async function generateAllModuleConfigs(
  moduleNames: string[],
  endpoints: Map<string, ApiEndpoint[]>,
  llmProvider: LlmProvider,
  options?: Partial<GenerateConfigOptions>,
): Promise<Map<string, GenerateConfigResult>> {
  const results = new Map<string, GenerateConfigResult>();

  for (const moduleName of moduleNames) {
    const eps = endpoints.get(moduleName) || [];
    const result = await generateModuleConfig({
      moduleName,
      endpoints: eps,
      llmProvider,
      ...options,
    });
    results.set(moduleName, result);
  }

  const successCount = Array.from(results.values()).filter((r) => r.success).length;
  console.log(`[ai-config-suggester] Summary: ${successCount}/${moduleNames.length} succeeded`);

  return results;
}
