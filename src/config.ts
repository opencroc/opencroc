import * as path from 'node:path';
import type { OpenCrocConfig, ResolvedConfig, BackendAdapter, LlmProvider } from './types.js';
import { createSequelizeAdapter } from './adapters/sequelize-adapter.js';
import { createLlmProvider } from './adapters/llm-provider.js';

/**
 * Define an OpenCroc configuration with type checking.
 *
 * @example
 * ```ts
 * // opencroc.config.ts
 * import { defineConfig } from 'opencroc';
 *
 * export default defineConfig({
 *   backendRoot: './backend',
 *   adapter: 'sequelize',
 *   llm: {
 *     provider: 'openai',
 *     model: 'gpt-4o-mini',
 *   },
 * });
 * ```
 */
export function defineConfig(config: OpenCrocConfig): OpenCrocConfig {
  return config;
}

/**
 * Load config from opencroc.config.ts using cosmiconfig.
 * Falls back to default config if no file found.
 */
export async function loadConfig(searchFrom?: string): Promise<OpenCrocConfig> {
  const { cosmiconfig } = await import('cosmiconfig');
  const explorer = cosmiconfig('opencroc', {
    searchPlaces: [
      'opencroc.config.ts',
      'opencroc.config.js',
      'opencroc.config.mjs',
      'opencroc.config.cjs',
      '.opencrocrc.json',
      '.opencrocrc.yaml',
      '.opencrocrc.yml',
    ],
  });

  const result = await explorer.search(searchFrom);
  if (!result || result.isEmpty) {
    return { backendRoot: './backend' };
  }

  // cosmiconfig returns the raw export; handle default export
  const raw = result.config;
  return typeof raw === 'object' && raw !== null && 'default' in raw
    ? (raw as { default: OpenCrocConfig }).default
    : raw as OpenCrocConfig;
}

/**
 * Resolve a user config into a fully-resolved config with all defaults filled.
 */
export function resolveConfig(config: OpenCrocConfig): ResolvedConfig {
  const resolvedAdapter: string | BackendAdapter =
    config.adapter ?? createSequelizeAdapter();

  const resolvedLlmProvider: LlmProvider | undefined =
    config.llm ? createLlmProvider(config.llm) : undefined;

  return {
    _resolved: true,
    backendRoot: path.resolve(config.backendRoot),
    outDir: config.outDir ?? './opencroc-output',
    adapter: typeof resolvedAdapter === 'string' ? resolveAdapterByName(resolvedAdapter) : resolvedAdapter,
    llm: config.llm ?? { provider: 'openai' },
    playwright: config.playwright ?? {},
    modules: config.modules ?? [],
    steps: config.steps ?? ['scan', 'er-diagram', 'api-chain', 'plan', 'codegen', 'validate'],
    selfHealing: config.selfHealing ?? { enabled: true, maxIterations: 3 },
    report: config.report ?? { format: ['html'] },
    execution: config.execution ?? {},
    runtime: config.runtime ?? {},
    _llmProvider: resolvedLlmProvider,
  } as ResolvedConfig;
}

function resolveAdapterByName(name: string): BackendAdapter {
  switch (name) {
    case 'sequelize':
      return createSequelizeAdapter();
    case 'typeorm':
    case 'prisma':
      throw new Error(`Adapter "${name}" is not yet implemented. Use a custom BackendAdapter instead.`);
    default:
      throw new Error(`Unknown adapter: "${name}". Supported: sequelize, typeorm, prisma.`);
  }
}
