import { describe, it, expect } from 'vitest';
import { createPipeline } from './index.js';
import type { OpenCrocConfig } from '../types.js';

describe('createPipeline', () => {
  const config: OpenCrocConfig = { backendRoot: './nonexistent-dir' };

  it('returns an object with a run method', () => {
    const pipeline = createPipeline(config);
    expect(pipeline).toBeDefined();
    expect(typeof pipeline.run).toBe('function');
  });

  it('run() returns a PipelineRunResult', async () => {
    const pipeline = createPipeline(config);
    const result = await pipeline.run();
    expect(result).toHaveProperty('modules');
    expect(result).toHaveProperty('erDiagrams');
    expect(result).toHaveProperty('duration');
    expect(typeof result.duration).toBe('number');
  });

  it('run() with specific steps works', async () => {
    const pipeline = createPipeline(config);
    const result = await pipeline.run(['scan']);
    expect(Array.isArray(result.modules)).toBe(true);
  });
});
