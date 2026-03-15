/**
 * Module Config Preset Loader
 *
 * Loads pre-generated module test configs (JSON) from a directory,
 * validates them, and provides lookup by module name.
 *
 * This supports the 70 module configs migrated from dynamic-gen/module-configs/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModuleTestConfig } from '../types.js';
import { validateModuleConfig } from '../validators/config-validator.js';

export interface PresetLoadResult {
  configs: Map<string, ModuleTestConfig>;
  errors: Array<{ file: string; error: string }>;
  totalLoaded: number;
  totalFailed: number;
}

/**
 * Load all module config presets from a directory.
 *
 * @param configDir - Path to directory containing *.json module configs
 * @param options.validate - Run schema validation on each config (default: true)
 * @returns Loaded configs indexed by moduleName
 */
export function loadModulePresets(
  configDir: string,
  options?: { validate?: boolean },
): PresetLoadResult {
  const doValidate = options?.validate ?? true;
  const configs = new Map<string, ModuleTestConfig>();
  const errors: Array<{ file: string; error: string }> = [];

  const absDir = path.resolve(configDir);
  if (!fs.existsSync(absDir)) {
    return { configs, errors: [{ file: absDir, error: 'Directory does not exist' }], totalLoaded: 0, totalFailed: 1 };
  }

  const files = fs.readdirSync(absDir).filter((f) => f.endsWith('.json') && !f.includes('.fix-history'));

  for (const file of files) {
    const filePath = path.join(absDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config: ModuleTestConfig = JSON.parse(content);

      if (!config.moduleName) {
        errors.push({ file, error: 'Missing moduleName field' });
        continue;
      }

      // Optional validation
      if (doValidate) {
        const result = validateModuleConfig(config, undefined, { skipLayers: ['semantic', 'dryrun'] });
        if (!result.passed) {
          const errorMsgs = result.errors.map((e) => `[${e.path}] ${e.message}`).join('; ');
          errors.push({ file, error: `Schema validation failed: ${errorMsgs}` });
          // Still load it — it's usable even with warnings
        }
      }

      configs.set(config.moduleName, config);
    } catch (err) {
      errors.push({ file, error: (err as Error).message });
    }
  }

  return {
    configs,
    errors,
    totalLoaded: configs.size,
    totalFailed: errors.length,
  };
}

/**
 * Get a single module config by name from a preset directory.
 */
export function getModulePreset(
  configDir: string,
  moduleName: string,
): ModuleTestConfig | null {
  const filePath = path.resolve(configDir, `${moduleName}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * List all available module preset names from a directory.
 */
export function listModulePresets(configDir: string): string[] {
  const absDir = path.resolve(configDir);
  if (!fs.existsSync(absDir)) return [];

  return fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.json') && !f.includes('.fix-history'))
    .map((f) => f.replace(/\.json$/, ''));
}
