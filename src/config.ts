import type { OpenCrocConfig } from './types.js';

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
