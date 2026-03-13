import { describe, it, expect } from 'vitest';
import { validateConfig } from './config-validator.js';

describe('validateConfig', () => {
  it('returns errors for empty config (missing backendRoot)', () => {
    const result = validateConfig({});
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].field).toBe('backendRoot');
    expect(result[0].severity).toBe('error');
  });

  it('returns empty array for valid config', () => {
    const result = validateConfig({ backendRoot: './backend' });
    expect(result).toEqual([]);
  });

  it('validates invalid adapter', () => {
    const result = validateConfig({ backendRoot: '.', adapter: 'invalid-orm' });
    expect(result.some((e) => e.field === 'adapter')).toBe(true);
  });

  it('validates invalid pipeline step', () => {
    const result = validateConfig({ backendRoot: '.', steps: ['scan', 'invalid-step'] });
    expect(result.some((e) => e.field === 'steps')).toBe(true);
  });

  it('validates invalid LLM provider', () => {
    const result = validateConfig({ backendRoot: '.', llm: { provider: 'invalid' } });
    expect(result.some((e) => e.field === 'llm.provider')).toBe(true);
  });

  it('warns when LLM apiKey is missing for cloud provider', () => {
    const result = validateConfig({ backendRoot: '.', llm: { provider: 'openai' } });
    expect(result.some((e) => e.field === 'llm.apiKey' && e.severity === 'warning')).toBe(true);
  });

  it('validates invalid report format', () => {
    const result = validateConfig({ backendRoot: '.', report: { format: ['pdf'] } });
    expect(result.some((e) => e.field === 'report.format')).toBe(true);
  });

  it('validates invalid self-healing mode', () => {
    const result = validateConfig({ backendRoot: '.', selfHealing: { mode: 'invalid' } });
    expect(result.some((e) => e.field === 'selfHealing.mode')).toBe(true);
  });

  it('accepts drizzle adapter', () => {
    const result = validateConfig({ backendRoot: '.', adapter: 'drizzle' });
    expect(result.some((e) => e.field === 'adapter')).toBe(false);
  });

  it('validates invalid execution hook shape', () => {
    const result = validateConfig({
      backendRoot: '.',
      execution: { setupHook: { args: ['node'] } },
    });
    expect(result.some((e) => e.field === 'execution.setupHook.command')).toBe(true);
  });

  it('accepts string/object execution hooks', () => {
    const result = validateConfig({
      backendRoot: '.',
      execution: {
        setupHook: 'npm run e2e:setup',
        authHook: { command: 'node', args: ['scripts/auth.js'] },
        teardownHook: { command: 'npm', args: ['run', 'e2e:cleanup'], cwd: '.' },
      },
    });
    expect(result.some((e) => e.field.startsWith('execution.'))).toBe(false);
  });
});
