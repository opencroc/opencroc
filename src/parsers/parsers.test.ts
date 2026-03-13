import { describe, it, expect } from 'vitest';
import { createModelParser } from './model-parser.js';
import { createControllerParser } from './controller-parser.js';
import { createAssociationParser } from './association-parser.js';

describe('createModelParser', () => {
  it('returns a parser with parseFile and parseDirectory', () => {
    const parser = createModelParser();
    expect(typeof parser.parseFile).toBe('function');
    expect(typeof parser.parseDirectory).toBe('function');
  });

  it('parseFile returns null for nonexistent file', async () => {
    const parser = createModelParser();
    const result = await parser.parseFile('nonexistent-file.ts');
    expect(result).toBeNull();
  });

  it('parseDirectory returns empty array for nonexistent dir', async () => {
    const parser = createModelParser();
    const result = await parser.parseDirectory('nonexistent-dir');
    expect(result).toEqual([]);
  });
});

describe('createControllerParser', () => {
  it('returns a parser with parseFile and parseDirectory', () => {
    const parser = createControllerParser();
    expect(typeof parser.parseFile).toBe('function');
    expect(typeof parser.parseDirectory).toBe('function');
  });

  it('parseFile returns empty array for nonexistent file', async () => {
    const parser = createControllerParser();
    const result = await parser.parseFile('nonexistent-file.ts');
    expect(result).toEqual([]);
  });

  it('parseDirectory returns empty array for nonexistent dir', async () => {
    const parser = createControllerParser();
    const result = await parser.parseDirectory('nonexistent-dir');
    expect(result).toEqual([]);
  });
});

describe('createAssociationParser', () => {
  it('returns a parser with parseFile', () => {
    const parser = createAssociationParser();
    expect(typeof parser.parseFile).toBe('function');
  });

  it('parseFile returns empty array for nonexistent file', async () => {
    const parser = createAssociationParser();
    const result = await parser.parseFile('nonexistent-file.ts');
    expect(result).toEqual([]);
  });
});
