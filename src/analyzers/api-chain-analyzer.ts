import type {
  ApiEndpoint,
  ApiDependency,
  ApiChainAnalysisResult,
  DirectedAcyclicGraph,
} from '../types.js';

const EXCLUDED_PARAMS = new Set(['tenantId']);

const enum Color { WHITE = 0, GRAY = 1, BLACK = 2 }

function toNodeKey(endpoint: ApiEndpoint): string {
  return `${endpoint.method} ${endpoint.path}`;
}

function paramToResourceHint(param: string): string {
  const stripped = param.endsWith('Id') ? param.slice(0, -2) : param;
  return stripped.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function postProducesResource(postEndpoint: ApiEndpoint, resourceHint: string): boolean {
  const segments = postEndpoint.path.split('/').filter((s) => s && !s.startsWith(':'));
  if (segments.length === 0) return false;

  const lastSegment = segments[segments.length - 1].toLowerCase();
  if (lastSegment.includes(resourceHint)) return true;

  const parts = lastSegment.split('-');
  if (parts.some((p) => p === resourceHint || p.startsWith(resourceHint))) return true;

  if (resourceHint.length <= 4) {
    const abbreviation = parts.map((p) => p[0]).join('');
    if (abbreviation.startsWith(resourceHint)) return true;
  }
  return false;
}

/**
 * Infer API dependencies via path parameter matching.
 * POST endpoints produce IDs; GET/PUT/DELETE endpoints consume them.
 */
export function inferDependencies(endpoints: ApiEndpoint[]): ApiDependency[] {
  const dependencies: ApiDependency[] = [];
  const postEndpoints = endpoints.filter((ep) => ep.method === 'POST');

  for (const consumer of endpoints) {
    const consumedParams = consumer.pathParams.filter((p) => !EXCLUDED_PARAMS.has(p));
    if (consumedParams.length === 0) continue;

    for (const param of consumedParams) {
      if (param === 'id') {
        const basePath = consumer.path.replace(/\/:id(\/.*)?$/, '');
        const producer = postEndpoints.find((ep) => ep.path === basePath);
        if (producer && toNodeKey(producer) !== toNodeKey(consumer)) {
          dependencies.push({ from: consumer, to: producer, paramMapping: { [`:${param}`]: 'response.data.id' } });
        }
        continue;
      }

      const resourceHint = paramToResourceHint(param);
      if (!resourceHint) continue;

      const producer = postEndpoints.find((ep) => postProducesResource(ep, resourceHint));
      if (producer && toNodeKey(producer) !== toNodeKey(consumer)) {
        dependencies.push({ from: consumer, to: producer, paramMapping: { [`:${param}`]: 'response.data.id' } });
      }
    }
  }
  return deduplicateDependencies(dependencies);
}

function deduplicateDependencies(deps: ApiDependency[]): ApiDependency[] {
  const map = new Map<string, ApiDependency>();
  for (const dep of deps) {
    const key = `${toNodeKey(dep.from)}→${toNodeKey(dep.to)}`;
    if (map.has(key)) {
      Object.assign(map.get(key)!.paramMapping, dep.paramMapping);
    } else {
      map.set(key, { ...dep, paramMapping: { ...dep.paramMapping } });
    }
  }
  return Array.from(map.values());
}

/**
 * Build a directed graph from endpoints and their dependencies.
 */
export function buildGraph(
  endpoints: ApiEndpoint[],
  dependencies: ApiDependency[],
): DirectedAcyclicGraph {
  const nodeSet = new Set<string>();
  for (const ep of endpoints) nodeSet.add(toNodeKey(ep));

  const edges: Array<{ from: string; to: string; label?: string }> = [];
  for (const dep of dependencies) {
    edges.push({
      from: toNodeKey(dep.from),
      to: toNodeKey(dep.to),
      label: Object.keys(dep.paramMapping).join(', ') || undefined,
    });
  }
  return { nodes: Array.from(nodeSet), edges };
}

/**
 * Detect cycles in a directed graph using DFS coloring.
 */
export function detectCycles(dag: DirectedAcyclicGraph): string[] {
  const adjacency = new Map<string, string[]>();
  for (const node of dag.nodes) adjacency.set(node, []);
  for (const edge of dag.edges) adjacency.get(edge.from)?.push(edge.to);

  const color = new Map<string, Color>();
  for (const node of dag.nodes) color.set(node, Color.WHITE);

  const warnings: string[] = [];
  const path: string[] = [];

  function dfs(node: string): void {
    color.set(node, Color.GRAY);
    path.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const nc = color.get(neighbor);
      if (nc === Color.GRAY) {
        const cycleStart = path.indexOf(neighbor);
        warnings.push(`Cycle detected: ${path.slice(cycleStart).concat(neighbor).join(' → ')}`);
      } else if (nc === Color.WHITE) {
        dfs(neighbor);
      }
    }
    path.pop();
    color.set(node, Color.BLACK);
  }

  for (const node of dag.nodes) {
    if (color.get(node) === Color.WHITE) dfs(node);
  }
  return warnings;
}

/**
 * Topological sort using Kahn's algorithm.
 */
export function topologicalSort(dag: DirectedAcyclicGraph): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of dag.nodes) { inDegree.set(node, 0); adjacency.set(node, []); }
  for (const edge of dag.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const nd = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, nd);
      if (nd === 0) queue.push(neighbor);
    }
  }
  return sorted;
}

export interface ApiChainAnalyzer {
  analyze(endpoints: ApiEndpoint[]): ApiChainAnalysisResult;
}

/**
 * Analyze API endpoints: infer dependencies, build DAG, detect cycles, topological sort.
 */
export function createApiChainAnalyzer(): ApiChainAnalyzer {
  return {
    analyze(endpoints: ApiEndpoint[]): ApiChainAnalysisResult {
      const dependencies = inferDependencies(endpoints);
      const dag = buildGraph(endpoints, dependencies);
      const cycleWarnings = detectCycles(dag);

      return {
        moduleName: '',
        endpoints,
        dependencies,
        dag,
        hasCycles: cycleWarnings.length > 0,
        cycleWarnings,
      };
    },
  };
}
