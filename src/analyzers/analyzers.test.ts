import { describe, it, expect } from 'vitest';
import {
  inferDependencies,
  buildGraph,
  detectCycles,
  topologicalSort,
  createApiChainAnalyzer,
} from './api-chain-analyzer.js';
import type { ApiEndpoint } from '../types.js';

function makeEndpoint(method: string, path: string): ApiEndpoint {
  return {
    method,
    path,
    pathParams: (path.match(/:(\w+)/g) || []).map((p) => p.slice(1)),
    queryParams: [],
    bodyFields: [],
    responseFields: [],
    relatedTables: [],
    description: '',
  };
}

describe('inferDependencies', () => {
  it('infers POST → GET/:id dependency', () => {
    const endpoints = [
      makeEndpoint('POST', '/v1/:tenantId/resources'),
      makeEndpoint('GET', '/v1/:tenantId/resources/:id'),
    ];
    const deps = inferDependencies(endpoints);
    expect(deps.length).toBe(1);
    expect(deps[0].to.method).toBe('POST');
    expect(deps[0].from.method).toBe('GET');
  });

  it('returns empty for endpoints without path params', () => {
    const endpoints = [
      makeEndpoint('GET', '/v1/:tenantId/resources'),
      makeEndpoint('POST', '/v1/:tenantId/resources'),
    ];
    const deps = inferDependencies(endpoints);
    expect(deps).toEqual([]);
  });
});

describe('buildGraph', () => {
  it('builds a graph with nodes and edges', () => {
    const ep1 = makeEndpoint('POST', '/items');
    const ep2 = makeEndpoint('GET', '/items/:id');
    const dag = buildGraph([ep1, ep2], [{ from: ep2, to: ep1, paramMapping: { ':id': 'response.data.id' } }]);
    expect(dag.nodes).toHaveLength(2);
    expect(dag.edges).toHaveLength(1);
  });
});

describe('detectCycles', () => {
  it('detects no cycles in acyclic graph', () => {
    const dag = { nodes: ['A', 'B', 'C'], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] };
    expect(detectCycles(dag)).toEqual([]);
  });

  it('detects cycle', () => {
    const dag = { nodes: ['A', 'B'], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }] };
    expect(detectCycles(dag).length).toBeGreaterThan(0);
  });
});

describe('topologicalSort', () => {
  it('sorts nodes in dependency order', () => {
    const dag = { nodes: ['A', 'B', 'C'], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] };
    const sorted = topologicalSort(dag);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
  });

  it('handles graph with no edges', () => {
    const dag = { nodes: ['X', 'Y', 'Z'], edges: [] };
    const sorted = topologicalSort(dag);
    expect(sorted).toHaveLength(3);
  });
});

describe('createApiChainAnalyzer', () => {
  it('analyzes endpoints and returns result', () => {
    const analyzer = createApiChainAnalyzer();
    const endpoints = [
      makeEndpoint('POST', '/resources'),
      makeEndpoint('GET', '/resources/:id'),
      makeEndpoint('DELETE', '/resources/:id'),
    ];
    const result = analyzer.analyze(endpoints);
    expect(result.endpoints).toHaveLength(3);
    expect(result.dag.nodes.length).toBeGreaterThan(0);
    expect(typeof result.hasCycles).toBe('boolean');
  });
});
