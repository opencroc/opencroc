import type { TableSchema } from '../types.js';

export interface MockDataGenerator {
  generateForTable(schema: TableSchema): Record<string, unknown>;
  generateForTables(schemas: TableSchema[]): Map<string, Record<string, unknown>[]>;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(prefix: string, fieldName: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}${fieldName}_${ts}_${rand}`;
}

function generateUUID(): string {
  const hex = () => Math.random().toString(16).slice(2, 6);
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(8 + randomInt(0, 3)).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

/**
 * Generate a mock value based on field type and constraints.
 */
function generateFieldValue(
  fieldName: string,
  fieldType: string,
  isForeignKey: boolean,
  parentTable?: string,
): unknown {
  const upper = fieldType.toUpperCase();

  if (isForeignKey && parentTable) {
    return `{{parentRecordIds.${parentTable}}}`;
  }

  if (upper.startsWith('STRING') || upper === 'TEXT') return randomString('test_', fieldName);
  if (upper === 'BIGINT' || upper === 'INTEGER') return randomInt(1, 999999);
  if (upper === 'BOOLEAN') return true;
  if (upper.startsWith('DATE') || upper === 'NOW') return new Date().toISOString();
  if (upper === 'UUID') return generateUUID();
  if (upper.startsWith('ENUM')) return 'ACTIVE';
  if (upper === 'JSON' || upper === 'JSONB') return {};
  if (upper === 'FLOAT' || upper === 'DOUBLE' || upper === 'DECIMAL') return Math.round(Math.random() * 10000) / 100;

  return randomString('val_', fieldName);
}

export function createMockDataGenerator(): MockDataGenerator {
  return {
    generateForTable(schema: TableSchema): Record<string, unknown> {
      const record: Record<string, unknown> = {};
      const ts = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 6);

      for (const field of schema.fields) {
        // Skip auto-generated primary keys
        if (field.primaryKey) continue;
        // Skip fields with default values
        if (field.defaultValue !== undefined) continue;

        // Detect foreign key fields (ending with _id)
        const isForeignKey = field.name.endsWith('_id') && !field.primaryKey;
        const parentTable = isForeignKey
          ? field.name.replace(/_id$/, '')
          : undefined;

        let value = generateFieldValue(field.name, field.type, isForeignKey, parentTable);

        // Unique constraint: append suffix
        if (field.unique && typeof value === 'string') {
          value = `${value}__e2e_test_${ts}_${rand}`;
        }

        record[field.name] = value;
      }
      return record;
    },

    generateForTables(schemas: TableSchema[]): Map<string, Record<string, unknown>[]> {
      const result = new Map<string, Record<string, unknown>[]>();
      for (const schema of schemas) {
        const record = this.generateForTable(schema);
        result.set(schema.tableName, [record]);
      }
      return result;
    },
  };
}
