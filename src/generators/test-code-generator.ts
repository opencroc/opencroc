import type { GeneratedTestFile, TestChain } from '../types.js';

export interface TestCodeGenerator {
  generate(chains: TestChain[]): GeneratedTestFile[];
}

export function createTestCodeGenerator(): TestCodeGenerator {
  return {
    generate(_chains) {
      // TODO: Generate Playwright test files from chain plans
      throw new Error('Test code generator not yet implemented');
    },
  };
}
