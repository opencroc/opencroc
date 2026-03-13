import type { RouteEntry } from '../types.js';

export interface ControllerParser {
  parseFile(filePath: string): Promise<RouteEntry[]>;
  parseDirectory(dirPath: string): Promise<RouteEntry[]>;
}

export function createControllerParser(): ControllerParser {
  return {
    async parseFile(_filePath) {
      // TODO: Use ts-morph to extract route definitions from controllers
      throw new Error('Controller parser not yet implemented');
    },
    async parseDirectory(_dirPath) {
      throw new Error('Controller parser not yet implemented');
    },
  };
}
