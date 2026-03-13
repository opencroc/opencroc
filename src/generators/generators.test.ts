import { describe, it, expect } from 'vitest';
import { createERDiagramGenerator } from './er-diagram-generator.js';
import { createMockDataGenerator } from './mock-data-generator.js';
import { createTestCodeGenerator } from './test-code-generator.js';
import type { TableSchema, ForeignKeyRelation, TestChain } from '../types.js';

describe('createERDiagramGenerator', () => {
  it('generates Mermaid ER diagram', () => {
    const gen = createERDiagramGenerator();
    const tables: TableSchema[] = [
      { tableName: 'users', fields: [{ name: 'id', type: 'BIGINT', primaryKey: true }, { name: 'name', type: 'STRING' }] },
      { tableName: 'posts', fields: [{ name: 'id', type: 'BIGINT', primaryKey: true }, { name: 'user_id', type: 'BIGINT' }] },
    ];
    const relations: ForeignKeyRelation[] = [
      { sourceTable: 'users', sourceField: 'id', targetTable: 'posts', targetField: 'user_id', cardinality: '1:N' },
    ];
    const result = gen.generate(tables, relations);
    expect(result.tables).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.mermaidText).toContain('erDiagram');
    expect(result.mermaidText).toContain('users');
    expect(result.mermaidText).toContain('posts');
  });

  it('returns empty diagram for no tables', () => {
    const gen = createERDiagramGenerator();
    const result = gen.generate([], []);
    expect(result.mermaidText).toContain('erDiagram');
    expect(result.tables).toEqual([]);
  });
});

describe('createMockDataGenerator', () => {
  it('generates mock data for a table', () => {
    const gen = createMockDataGenerator();
    const schema: TableSchema = {
      tableName: 'test_table',
      fields: [
        { name: 'id', type: 'BIGINT', primaryKey: true },
        { name: 'name', type: 'STRING' },
        { name: 'count', type: 'INTEGER' },
        { name: 'active', type: 'BOOLEAN' },
        { name: 'created_at', type: 'DATE' },
      ],
    };
    const record = gen.generateForTable(schema);
    expect(record).not.toHaveProperty('id'); // skip PK
    expect(typeof record.name).toBe('string');
    expect(typeof record.count).toBe('number');
    expect(record.active).toBe(true);
    expect(typeof record.created_at).toBe('string');
  });

  it('generates for multiple tables', () => {
    const gen = createMockDataGenerator();
    const schemas: TableSchema[] = [
      { tableName: 'a', fields: [{ name: 'id', type: 'BIGINT', primaryKey: true }, { name: 'val', type: 'STRING' }] },
      { tableName: 'b', fields: [{ name: 'id', type: 'BIGINT', primaryKey: true }, { name: 'val', type: 'INTEGER' }] },
    ];
    const result = gen.generateForTables(schemas);
    expect(result.size).toBe(2);
    expect(result.get('a')).toHaveLength(1);
    expect(result.get('b')).toHaveLength(1);
  });
});

describe('createTestCodeGenerator', () => {
  it('generates Playwright test files from chains', () => {
    const gen = createTestCodeGenerator();
    const chains: TestChain[] = [
      {
        name: 'User CRUD',
        module: 'users',
        steps: [
          {
            order: 1,
            action: 'POST',
            endpoint: {
              method: 'POST', path: '/users', pathParams: [],
              queryParams: [], bodyFields: [], responseFields: [],
              relatedTables: [], description: 'Create user',
            },
            description: 'Create user',
            assertions: [],
          },
        ],
      },
    ];
    const files = gen.generate(chains);
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("@playwright/test");
    expect(files[0].content).toContain('User CRUD');
    expect(files[0].module).toBe('users');
  });
});
