import type { ERDiagramResult, TableSchema, ForeignKeyRelation } from '../types.js';

export interface ERDiagramGenerator {
  generate(tables: TableSchema[], relations: ForeignKeyRelation[]): ERDiagramResult;
}

export function createERDiagramGenerator(): ERDiagramGenerator {
  return {
    generate(_tables, _relations) {
      // TODO: Generate Mermaid ER diagram from parsed schemas
      throw new Error('ER diagram generator not yet implemented');
    },
  };
}
