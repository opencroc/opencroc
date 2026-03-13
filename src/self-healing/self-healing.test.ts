import { describe, it, expect } from 'vitest';
import { createSelfHealingLoop, categorizeFailure } from './index.js';

describe('categorizeFailure', () => {
  it('categorizes 500 errors as backend-5xx', () => {
    expect(categorizeFailure('HTTP 500 Internal Server Error').category).toBe('backend-5xx');
  });

  it('categorizes timeout errors', () => {
    expect(categorizeFailure('Request timed out after 30s').category).toBe('timeout');
  });

  it('categorizes network errors', () => {
    expect(categorizeFailure('ECONNREFUSED 127.0.0.1:3000').category).toBe('network');
  });

  it('categorizes 404 as endpoint-not-found', () => {
    expect(categorizeFailure('404 Not Found').category).toBe('endpoint-not-found');
  });

  it('categorizes unknown errors', () => {
    const result = categorizeFailure('something unexpected happened');
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBeLessThan(1);
  });
});

describe('createSelfHealingLoop', () => {
  it('returns a loop with run method', () => {
    const loop = createSelfHealingLoop({ enabled: true });
    expect(typeof loop.run).toBe('function');
  });

  it('run returns a SelfHealingResult', async () => {
    const loop = createSelfHealingLoop({ enabled: true, maxIterations: 1 });
    const result = await loop.run('./test-results');
    expect(result).toHaveProperty('iterations');
    expect(result).toHaveProperty('fixed');
    expect(result).toHaveProperty('remaining');
    expect(result.iterations).toBe(1);
  });
});
