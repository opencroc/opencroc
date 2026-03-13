import type { ImpactReport } from '../types.js';

export interface ImpactReporter {
  analyze(failedEndpoints: string[]): Promise<ImpactReport>;
}

export function createImpactReporter(): ImpactReporter {
  return {
    async analyze(_failedEndpoints) {
      // TODO: Trace failure impact through dependency chains
      throw new Error('Impact reporter not yet implemented');
    },
  };
}
