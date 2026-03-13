import { describe, it, expect } from 'vitest';
import { loadConfig } from './load-config.js';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(__dirname, '..', '..', '.test-tmp-config');

function setup(filename: string, content: string): void {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, filename), content, 'utf-8');
}

function cleanup(): void {
  rmSync(TMP, { recursive: true, force: true });
}

describe('loadConfig', () => {
  it('loads opencroc.config.json', async () => {
    setup('opencroc.config.json', JSON.stringify({ backendRoot: './api' }));
    try {
      const { config, filepath } = await loadConfig(TMP);
      expect(config.backendRoot).toBe('./api');
      expect(filepath).toContain('opencroc.config.json');
    } finally {
      cleanup();
    }
  });

  it('throws when no config is found', async () => {
    mkdirSync(TMP, { recursive: true });
    try {
      await expect(loadConfig(TMP)).rejects.toThrow('No opencroc config found');
    } finally {
      cleanup();
    }
  });

  it('throws when backendRoot is missing', async () => {
    setup('opencroc.config.json', JSON.stringify({ adapter: 'sequelize' }));
    try {
      await expect(loadConfig(TMP)).rejects.toThrow('"backendRoot" is required');
    } finally {
      cleanup();
    }
  });
});
