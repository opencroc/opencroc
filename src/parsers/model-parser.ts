import type { TableSchema } from '../types.js';

export interface ModelParser {
  parseFile(filePath: string): Promise<TableSchema>;
  parseDirectory(dirPath: string): Promise<TableSchema[]>;
}

export function createModelParser(): ModelParser {
  return {
    async parseFile(_filePath) {
      // TODO: Use ts-morph to parse Sequelize/TypeORM/Prisma model files
      throw new Error('Model parser not yet implemented');
    },
    async parseDirectory(_dirPath) {
      throw new Error('Model parser not yet implemented');
    },
  };
}
