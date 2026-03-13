import { describe, it, expect } from 'vitest';
import * as api from '../index.js';

describe('public API exports', () => {
  it('exports defineConfig', () => {
    expect(typeof api.defineConfig).toBe('function');
  });

  it('exports createPipeline', () => {
    expect(typeof api.createPipeline).toBe('function');
  });

  it('exports parser factories', () => {
    expect(typeof api.createModelParser).toBe('function');
    expect(typeof api.createControllerParser).toBe('function');
    expect(typeof api.createAssociationParser).toBe('function');
  });

  it('exports parser standalone functions', () => {
    expect(typeof api.parseModelFile).toBe('function');
    expect(typeof api.parseModuleModels).toBe('function');
    expect(typeof api.parseControllerFile).toBe('function');
    expect(typeof api.parseControllerDirectory).toBe('function');
    expect(typeof api.parseAssociationFile).toBe('function');
    expect(typeof api.buildClassToTableMap).toBe('function');
    expect(typeof api.classNameToTableName).toBe('function');
    expect(typeof api.inferRelatedTables).toBe('function');
  });

  it('exports generator factories', () => {
    expect(typeof api.createTestCodeGenerator).toBe('function');
    expect(typeof api.createMockDataGenerator).toBe('function');
    expect(typeof api.createERDiagramGenerator).toBe('function');
  });

  it('exports analyzer factories and utilities', () => {
    expect(typeof api.createApiChainAnalyzer).toBe('function');
    expect(typeof api.createImpactReporter).toBe('function');
    expect(typeof api.inferDependencies).toBe('function');
    expect(typeof api.buildGraph).toBe('function');
    expect(typeof api.detectCycles).toBe('function');
    expect(typeof api.topologicalSort).toBe('function');
  });

  it('exports validateConfig', () => {
    expect(typeof api.validateConfig).toBe('function');
  });

  it('exports self-healing', () => {
    expect(typeof api.createSelfHealingLoop).toBe('function');
    expect(typeof api.categorizeFailure).toBe('function');
  });
});
