import type { TableSchema } from '../types.js';

export interface MockDataGenerator {
  generateForTable(schema: TableSchema): Record<string, unknown>;
  generateForTables(schemas: TableSchema[]): Map<string, Record<string, unknown>[]>;
}

export function createMockDataGenerator(): MockDataGenerator {
  return {
    generateForTable(_schema) {
      // TODO: Generate realistic mock data based on field types and constraints
      throw new Error('Mock data generator not yet implemented');
    },
    generateForTables(_schemas) {
      throw new Error('Mock data generator not yet implemented');
    },
  };
}
