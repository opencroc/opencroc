import type { ForeignKeyRelation } from '../types.js';

export interface AssociationParser {
  parseFile(filePath: string): Promise<ForeignKeyRelation[]>;
}

export function createAssociationParser(): AssociationParser {
  return {
    async parseFile(_filePath) {
      // TODO: Use ts-morph to extract association definitions
      throw new Error('Association parser not yet implemented');
    },
  };
}
