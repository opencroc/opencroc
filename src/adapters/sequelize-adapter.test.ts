import { describe, it, expect } from 'vitest';
import { createSequelizeAdapter } from './sequelize-adapter.js';

describe('SequelizeAdapter', () => {
  const adapter = createSequelizeAdapter();

  it('has correct name', () => {
    expect(adapter.name).toBe('sequelize');
  });

  it('parseModels returns array', async () => {
    // Non-existent dir → empty array
    const schemas = await adapter.parseModels('/non-existent-dir');
    expect(schemas).toEqual([]);
  });

  it('parseAssociations returns array', async () => {
    const relations = await adapter.parseAssociations('/non-existent-file.ts');
    expect(relations).toEqual([]);
  });

  it('parseControllers returns array', async () => {
    const routes = await adapter.parseControllers('/non-existent-dir');
    expect(routes).toEqual([]);
  });
});
