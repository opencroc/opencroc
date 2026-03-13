import type { ERDiagramResult, TableSchema, ForeignKeyRelation } from '../types.js';

export interface ERDiagramGenerator {
  generate(tables: TableSchema[], relations: ForeignKeyRelation[]): ERDiagramResult;
}

/**
 * Map field type string to a short Mermaid ER type label.
 */
function toMermaidType(fieldType: string): string {
  const upper = fieldType.toUpperCase();
  if (upper.startsWith('STRING')) return 'string';
  if (upper === 'BIGINT' || upper === 'INTEGER') return 'bigint';
  if (upper === 'BOOLEAN') return 'boolean';
  if (upper.startsWith('DATE') || upper === 'NOW') return 'datetime';
  if (upper === 'JSON' || upper === 'JSONB') return 'json';
  if (upper === 'TEXT') return 'text';
  if (upper === 'FLOAT' || upper === 'DOUBLE' || upper === 'DECIMAL') return 'float';
  if (upper === 'UUID') return 'uuid';
  if (upper.startsWith('ENUM')) return 'enum';
  return 'string';
}

/**
 * Mermaid requires entity names without special characters.
 */
function sanitizeEntityName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Generate Mermaid ER diagram syntax from parsed schemas and relations.
 */
function generateMermaidER(tables: TableSchema[], relations: ForeignKeyRelation[]): string {
  const lines: string[] = ['erDiagram'];

  // Entity blocks
  for (const table of tables) {
    const entityName = sanitizeEntityName(table.tableName);
    lines.push(`  ${entityName} {`);
    for (const field of table.fields) {
      const mType = toMermaidType(field.type);
      const pk = field.primaryKey ? 'PK' : '';
      const comment = field.comment ? ` "${field.comment}"` : '';
      lines.push(`    ${mType} ${field.name}${pk ? ' ' + pk : ''}${comment}`);
    }
    lines.push('  }');
  }

  // Relationships
  const tableNames = new Set(tables.map((t) => t.tableName));
  for (const rel of relations) {
    if (!tableNames.has(rel.sourceTable) || !tableNames.has(rel.targetTable)) continue;

    const src = sanitizeEntityName(rel.sourceTable);
    const tgt = sanitizeEntityName(rel.targetTable);
    const linkStyle = rel.isCrossModule ? '..' : '--';

    let cardinality: string;
    switch (rel.cardinality) {
      case '1:N': cardinality = `||${linkStyle}o{`; break;
      case 'N:1': cardinality = `}o${linkStyle}||`; break;
      case '1:1': cardinality = `||${linkStyle}||`; break;
      default: cardinality = `||${linkStyle}o{`;
    }

    lines.push(`  ${src} ${cardinality} ${tgt} : "${rel.targetField}"`);
  }

  return lines.join('\n');
}

export function createERDiagramGenerator(): ERDiagramGenerator {
  return {
    generate(tables: TableSchema[], relations: ForeignKeyRelation[]): ERDiagramResult {
      const mermaidText = generateMermaidER(tables, relations);
      return { tables, relations, mermaidText };
    },
  };
}
