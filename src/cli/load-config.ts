import { cosmiconfig } from 'cosmiconfig';
import type { OpenCrocConfig } from '../types.js';

const MODULE_NAME = 'opencroc';

const SEARCH_PLACES = [
  'opencroc.config.ts',
  'opencroc.config.js',
  'opencroc.config.json',
  '.opencrocrc.json',
  'package.json',
];

export interface LoadConfigResult {
  config: OpenCrocConfig;
  filepath: string;
}

export async function loadConfig(cwd?: string): Promise<LoadConfigResult> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: SEARCH_PLACES,
    ...(cwd ? { stopDir: cwd } : {}),
  });

  const result = cwd ? await explorer.search(cwd) : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      'No opencroc config found. Run `opencroc init` to create one.',
    );
  }

  const config: OpenCrocConfig =
    result.config?.default ?? result.config;

  if (!config.backendRoot) {
    throw new Error(
      `Invalid config in ${result.filepath}: "backendRoot" is required.`,
    );
  }

  return { config, filepath: result.filepath };
}
