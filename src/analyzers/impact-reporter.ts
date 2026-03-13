import type {
  ChainFailureResult,
  ERDiagramResult,
  ApiChainAnalysisResult,
  ApiEndpoint,
  ForeignKeyRelation,
  ImpactReport,
} from '../types.js';

const MAX_BFS_DEPTH = 5;

/**
 * Extract table names from an error chain path string.
 * Path format: "POST /path → field → table_name → GET /path"
 */
function extractTablesFromErrorChain(errorChainPath: string): string[] {
  const segments = errorChainPath.split('→').map((s) => s.trim());
  return segments.filter((s) => !s.includes('/') && !s.includes(' ') && s.includes('_'));
}

/**
 * Build bidirectional table adjacency from foreign key relations.
 */
function buildTableAdjacency(relations: ForeignKeyRelation[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const rel of relations) {
    if (!adj.has(rel.sourceTable)) adj.set(rel.sourceTable, new Set());
    if (!adj.has(rel.targetTable)) adj.set(rel.targetTable, new Set());
    adj.get(rel.sourceTable)!.add(rel.targetTable);
    adj.get(rel.targetTable)!.add(rel.sourceTable);
  }
  return adj;
}

/**
 * BFS traversal from seed tables along foreign key relations.
 */
function bfsTraversal(
  seedTables: string[],
  adjacency: Map<string, Set<string>>,
  maxDepth: number = MAX_BFS_DEPTH,
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ table: string; depth: number }> = [];

  for (const t of seedTables) {
    if (adjacency.has(t)) {
      queue.push({ table: t, depth: 0 });
      visited.add(t);
    }
  }

  while (queue.length > 0) {
    const { table, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    for (const neighbor of adjacency.get(table) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ table: neighbor, depth: depth + 1 });
      }
    }
  }
  return Array.from(visited);
}

/**
 * Find API endpoints that reference any of the given tables.
 */
function findAffectedEndpoints(
  tables: string[],
  analysisResults: ApiChainAnalysisResult[],
): ApiEndpoint[] {
  const tableSet = new Set(tables);
  const affected: ApiEndpoint[] = [];

  for (const result of analysisResults) {
    for (const ep of result.endpoints) {
      if (ep.relatedTables.some((t) => tableSet.has(t))) {
        affected.push(ep);
      }
    }
  }
  return affected;
}

/**
 * Generate a Mermaid flowchart from impact data.
 */
function generateMermaidDiagram(
  seedTables: string[],
  affectedTables: string[],
  relations: ForeignKeyRelation[],
): string {
  const relevantTables = new Set([...seedTables, ...affectedTables]);
  const lines: string[] = ['flowchart TD'];

  const seedSet = new Set(seedTables);
  for (const t of relevantTables) {
    const label = seedSet.has(t) ? `${t}:::error` : t;
    lines.push(`  ${sanitizeId(t)}["${label}"]`);
  }

  for (const rel of relations) {
    if (relevantTables.has(rel.sourceTable) && relevantTables.has(rel.targetTable)) {
      const arrow = rel.isCrossModule ? '-.->' : '-->';
      lines.push(`  ${sanitizeId(rel.sourceTable)} ${arrow}|${rel.targetField}| ${sanitizeId(rel.targetTable)}`);
    }
  }

  lines.push('  classDef error fill:#f96,stroke:#333,stroke-width:2px');
  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export interface ImpactReporter {
  analyze(
    failures: ChainFailureResult[],
    erDiagrams: Map<string, ERDiagramResult>,
    analysisResults: ApiChainAnalysisResult[],
  ): ImpactReport;
}

export function createImpactReporter(): ImpactReporter {
  return {
    analyze(
      failures: ChainFailureResult[],
      erDiagrams: Map<string, ERDiagramResult>,
      analysisResults: ApiChainAnalysisResult[],
    ): ImpactReport {
      // Collect all relations
      const allRelations: ForeignKeyRelation[] = [];
      for (const er of erDiagrams.values()) {
        allRelations.push(...er.relations);
      }

      // Extract seed tables from failure error chain paths
      const seedTables: string[] = [];
      for (const failure of failures) {
        if (failure.errorChainPath) {
          seedTables.push(...extractTablesFromErrorChain(failure.errorChainPath));
        }
      }

      // BFS to find all affected tables
      const adjacency = buildTableAdjacency(allRelations);
      const affectedTables = bfsTraversal(seedTables, adjacency);

      // Find affected endpoints
      const affectedEndpoints = findAffectedEndpoints(affectedTables, analysisResults);

      // Determine affected modules
      const affectedModules = [...new Set(analysisResults
        .filter((r) => r.endpoints.some((ep) => affectedEndpoints.includes(ep)))
        .map((r) => r.moduleName))];

      // Affected chains
      const affectedChains = failures.map((f) => f.chain);

      // Generate Mermaid diagram
      const mermaidText = generateMermaidDiagram(seedTables, affectedTables, allRelations);

      // Severity based on affected API count
      const count = affectedEndpoints.length;
      const severity = count > 10 ? 'critical' : count > 5 ? 'high' : count > 2 ? 'medium' : 'low';

      return {
        affectedModules,
        affectedChains,
        affectedEndpoints,
        affectedTables,
        severity,
        mermaidText,
      };
    },
  };
}
