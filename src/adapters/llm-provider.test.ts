import { describe, it, expect } from 'vitest';
import { createLlmProvider } from './llm-provider.js';

describe('LLM Provider Factory', () => {
  it('creates openai provider', () => {
    const provider = createLlmProvider({ provider: 'openai', apiKey: 'test-key' });
    expect(provider.name).toBe('openai');
    expect(provider.estimateTokens('hello world')).toBeGreaterThan(0);
  });

  it('creates zhipu provider', () => {
    const provider = createLlmProvider({ provider: 'zhipu', apiKey: 'test-key' });
    expect(provider.name).toBe('zhipu');
  });

  it('creates ollama provider', () => {
    const provider = createLlmProvider({ provider: 'ollama' });
    expect(provider.name).toBe('ollama');
  });

  it('throws for custom without instance', () => {
    expect(() => createLlmProvider({ provider: 'custom' })).toThrow('Custom LLM provider');
  });

  it('throws for unknown provider', () => {
    expect(() => createLlmProvider({ provider: 'unknown' as any })).toThrow('Unknown LLM provider');
  });
});
