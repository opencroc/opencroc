/**
 * Studio Routes — Universal Project Analysis
 *
 * New routes for the upgraded OpenCroc Studio that supports
 * scanning any project (local or GitHub URL), building knowledge
 * graphs, analyzing risks, and generating multi-perspective reports.
 */

import type { FastifyInstance } from 'fastify';
import { cloneAndScan } from '../../scanner/github-cloner.js';
import { buildKnowledgeGraph, getGraphStats, toMermaid } from '../../graph/index.js';
import { analyzeRisks, analyzeImpact, generateReport } from '../../insight/index.js';
import type {
  ReportPerspective,
  ScanResult,
} from '../../graph/types.js';
import type { CrocOffice } from '../croc-office.js';
import {
  EMPTY_STUDIO_STORE,
  type StudioProjectStore,
  type StudioSnapshotStore,
} from '../studio-store.js';

function restoreStore(snapshotStore?: StudioSnapshotStore): StudioProjectStore {
  return snapshotStore?.load() ?? { ...EMPTY_STUDIO_STORE };
}

export function registerStudioRoutes(
  app: FastifyInstance,
  office: CrocOffice,
  snapshotStore?: StudioSnapshotStore,
): void {
  const store = restoreStore(snapshotStore);
  // Transient — not persisted in snapshots
  let lastScanResult: ScanResult | null = null;

  if (store.graph) {
    office.log(`♻️ Restored Studio snapshot: ${store.graph.nodes.length} nodes, ${store.risks.length} risks`, 'info');
  }

  const persistStore = () => {
    snapshotStore?.save(store);
  };

  const broadcastGraph = () => {
    if (!store.graph) return;

    office.broadcast('graph:update', {
      nodes: store.graph.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        module: n.module,
        status: n.status,
      })),
      edges: store.graph.edges.map(e => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
      })),
    });
  };

  // ===== POST /api/studio/scan — Scan a project (local path or GitHub URL) =====
  app.post<{
    Body: {
      target: string; // Local path or GitHub URL or user/repo
      branch?: string;
      useLlm?: boolean;
    };
  }>('/api/studio/scan', async (req, reply) => {
    const { target, branch, useLlm } = req.body || {};

    if (!target || typeof target !== 'string') {
      reply.code(400).send({ error: 'Missing "target" field. Provide a local path or GitHub URL.' });
      return;
    }

    office.log(`🔍 Starting scan: ${target}`, 'info');
    office.updateAgent('parser-croc', { status: 'working', currentTask: `Scanning ${target}...`, progress: 0 });

    try {
      const scanResult = await cloneAndScan({
        target,
        branch,
        useLlm,
        keepClone: true,
        onProgress: (phase, percent, detail) => {
          office.updateAgent('parser-croc', { currentTask: detail || phase, progress: percent });
          office.broadcast('scan:progress', { phase, percent, detail });
        },
      });

      office.updateAgent('parser-croc', { status: 'done', currentTask: 'Scan complete', progress: 100 });
      office.log(`✅ Scan complete: ${scanResult.entities.length} entities, ${scanResult.relationships.length} relationships`);

      // Build knowledge graph
      office.updateAgent('analyzer-croc', { status: 'working', currentTask: 'Building knowledge graph...', progress: 0 });

      const projectName = target.includes('/') ? target.split('/').pop()!.replace('.git', '') : target.split(/[\\/]/).pop()!;

      const graph = buildKnowledgeGraph(scanResult, {
        projectName,
        source: target.startsWith('http') || /^[\w.-]+\/[\w.-]+$/.test(target) ? 'github' : 'local',
        sourceUrl: target,
        rootPath: target,
      });

      office.updateAgent('analyzer-croc', { status: 'done', currentTask: 'Graph built', progress: 100 });
      office.log(`📊 Knowledge graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

      // Analyze risks
      office.updateAgent('planner-croc', { status: 'working', currentTask: 'Analyzing risks...', progress: 0 });

      const risks = await analyzeRisks(graph);

      office.updateAgent('planner-croc', { status: 'done', currentTask: `${risks.length} risks found`, progress: 100 });

      // Store results
      store.graph = graph;
      store.risks = risks;
      store.scanTime = Date.now();
      store.source = target;
      lastScanResult = scanResult;
      persistStore();

      // Broadcast graph update
      broadcastGraph();

      return {
        ok: true,
        project: graph.projectInfo,
        stats: getGraphStats(graph),
        risks: risks.length,
        duration: graph.buildDuration + scanResult.duration,
      };
    } catch (err) {
      office.updateAgent('parser-croc', { status: 'error', currentTask: String(err) });
      office.log(`❌ Scan failed: ${err}`, 'error');
      reply.code(500).send({ error: `Scan failed: ${(err as Error).message}` });
      return;
    }
  });

  // ===== GET /api/studio/graph — Get current knowledge graph =====
  app.get('/api/studio/graph', async (_req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet. POST /api/studio/scan first.' });
      return;
    }

    return {
      nodes: store.graph.nodes,
      edges: store.graph.edges,
      projectInfo: store.graph.projectInfo,
      builtAt: store.graph.builtAt,
      stats: getGraphStats(store.graph),
    };
  });

  // ===== GET /api/studio/graph/mermaid — Get Mermaid diagram =====
  app.get<{
    Querystring: { types?: string; maxNodes?: string };
  }>('/api/studio/graph/mermaid', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    const nodeTypes = req.query.types?.split(',');
    const maxNodes = req.query.maxNodes ? parseInt(req.query.maxNodes, 10) : 50;

    return {
      mermaid: toMermaid(store.graph, { nodeTypes, maxNodes }),
    };
  });

  // ===== GET /api/studio/risks — Get risk analysis =====
  app.get<{
    Querystring: { severity?: string; category?: string };
  }>('/api/studio/risks', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    let risks = store.risks;
    if (req.query.severity) {
      risks = risks.filter(r => r.severity === req.query.severity);
    }
    if (req.query.category) {
      risks = risks.filter(r => r.category === req.query.category);
    }

    return { total: risks.length, risks };
  });

  // ===== GET /api/studio/impact/:nodeId — Analyze impact of a node =====
  app.get<{
    Params: { nodeId: string };
  }>('/api/studio/impact/:nodeId', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    // URL-decode the nodeId (since it contains colons and slashes)
    const nodeId = decodeURIComponent(req.params.nodeId);
    const impact = analyzeImpact(store.graph, nodeId);
    return impact;
  });

  // ===== GET /api/studio/report/:perspective — Generate perspective report =====
  app.get<{
    Params: { perspective: string };
  }>('/api/studio/report/:perspective', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    const validPerspectives = ['developer', 'architect', 'tester', 'product', 'student', 'executive'];
    const perspective = req.params.perspective;
    if (!validPerspectives.includes(perspective)) {
      reply.code(400).send({ error: `Invalid perspective. Valid: ${validPerspectives.join(', ')}` });
      return;
    }

    office.updateAgent('reporter-croc', { status: 'working', currentTask: `Generating ${perspective} report...` });

    const report = await generateReport(
      store.graph,
      perspective as ReportPerspective,
      store.risks,
    );

    office.updateAgent('reporter-croc', { status: 'done', currentTask: 'Report ready' });

    return report;
  });

  // ===== GET /api/studio/nodes — List nodes with filtering =====
  app.get<{
    Querystring: { type?: string; language?: string; module?: string; search?: string; limit?: string };
  }>('/api/studio/nodes', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    let nodes = store.graph.nodes;
    if (req.query.type) nodes = nodes.filter(n => n.type === req.query.type);
    if (req.query.language) nodes = nodes.filter(n => n.language === req.query.language);
    if (req.query.module) nodes = nodes.filter(n => n.module === req.query.module);
    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      nodes = nodes.filter(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    }

    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    return { total: nodes.length, nodes: nodes.slice(0, limit) };
  });

  // ===== GET /api/studio/node/:nodeId — Get node detail with neighbors =====
  app.get<{
    Params: { nodeId: string };
  }>('/api/studio/node/:nodeId', async (req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    const nodeId = decodeURIComponent(req.params.nodeId);
    const node = store.graph.nodes.find(n => n.id === nodeId);
    if (!node) {
      reply.code(404).send({ error: 'Node not found.' });
      return;
    }

    const incoming = store.graph.edges.filter(e => e.target === nodeId);
    const outgoing = store.graph.edges.filter(e => e.source === nodeId);
    const neighborIds = new Set([...incoming.map(e => e.source), ...outgoing.map(e => e.target)]);
    const neighbors = store.graph.nodes.filter(n => neighborIds.has(n.id));

    return { node, incoming, outgoing, neighbors };
  });

  // ===== GET /api/studio/summary — Quick one-line summary =====
  app.get('/api/studio/summary', async (_req, reply) => {
    if (!store.graph) {
      reply.code(404).send({ error: 'No project scanned yet.' });
      return;
    }

    const { projectInfo } = store.graph;
    const stats = getGraphStats(store.graph);
    const critical = store.risks.filter(r => r.severity === 'critical').length;
    const high = store.risks.filter(r => r.severity === 'high').length;
    const healthScore = Math.max(0, 100 - (critical * 20 + high * 10));

    return {
      name: projectInfo.name,
      oneLiner: `A ${projectInfo.projectType} project using ${projectInfo.frameworks.join(', ') || 'unknown'}, with ${stats.apiCount || 0} APIs and ${stats.modelCount || 0} data models.`,
      healthScore,
      stats,
      topRisks: store.risks.slice(0, 5).map(r => ({ severity: r.severity, title: r.title })),
      source: store.source,
    };
  });

  // ===== GET /api/studio/snapshots — List available snapshots =====
  app.get('/api/studio/snapshots', async () => {
    const snapshots = snapshotStore?.list() ?? [];
    return {
      total: snapshots.length,
      snapshots,
    };
  });

  // ===== POST /api/studio/snapshots/:id/load — Restore a snapshot =====
  app.post<{
    Params: { id: string };
  }>('/api/studio/snapshots/:id/load', async (req, reply) => {
    if (!snapshotStore) {
      reply.code(501).send({ error: 'Snapshot persistence is not configured.' });
      return;
    }

    const restored = snapshotStore.loadById(req.params.id);
    if (!restored) {
      reply.code(404).send({ error: 'Snapshot not found.' });
      return;
    }

    store.graph = restored.graph;
    store.risks = restored.risks;
    store.scanTime = restored.scanTime;
    store.source = restored.source;
    office.log(`♻️ Restored snapshot: ${store.source || 'unknown source'}`, 'info');
    broadcastGraph();

    return {
      ok: true,
      source: store.source,
      scanTime: store.scanTime,
      graph: store.graph ? {
        nodeCount: store.graph.nodes.length,
        edgeCount: store.graph.edges.length,
      } : null,
      risks: store.risks.length,
    };
  });

  // ===== POST /api/studio/snapshots/:id/rename — Rename a snapshot =====
  app.post<{
    Params: { id: string };
    Body: { name?: string };
  }>('/api/studio/snapshots/:id/rename', async (req, reply) => {
    if (!snapshotStore) {
      reply.code(501).send({ error: 'Snapshot persistence is not configured.' });
      return;
    }

    const name = req.body?.name?.trim();
    if (!name) {
      reply.code(400).send({ error: 'Snapshot name is required.' });
      return;
    }

    const renamed = snapshotStore.rename(req.params.id, name);
    if (!renamed) {
      reply.code(404).send({ error: 'Snapshot not found.' });
      return;
    }

    return {
      ok: true,
      snapshots: snapshotStore.list(),
    };
  });

  // ===== POST /api/studio/snapshots/:id/pin — Pin or unpin a snapshot =====
  app.post<{
    Params: { id: string };
    Body: { pinned?: boolean };
  }>('/api/studio/snapshots/:id/pin', async (req, reply) => {
    if (!snapshotStore) {
      reply.code(501).send({ error: 'Snapshot persistence is not configured.' });
      return;
    }

    const pinned = Boolean(req.body?.pinned);
    const updated = snapshotStore.pin(req.params.id, pinned);
    if (!updated) {
      reply.code(404).send({ error: 'Snapshot not found.' });
      return;
    }

    return {
      ok: true,
      snapshots: snapshotStore.list(),
    };
  });

  // ===== POST /api/studio/snapshots/:id/tags — Replace snapshot tags =====
  app.post<{
    Params: { id: string };
    Body: { tags?: string[] };
  }>('/api/studio/snapshots/:id/tags', async (req, reply) => {
    if (!snapshotStore) {
      reply.code(501).send({ error: 'Snapshot persistence is not configured.' });
      return;
    }

    const rawTags: string[] = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = [...new Set(rawTags
      .map((tag: string) => typeof tag === 'string' ? tag.trim() : '')
      .filter(Boolean)
    )];

    const updated = snapshotStore.updateTags(req.params.id, tags);
    if (!updated) {
      reply.code(404).send({ error: 'Snapshot not found.' });
      return;
    }

    return {
      ok: true,
      snapshots: snapshotStore.list(),
    };
  });

  // ===== POST /api/studio/snapshots/:id/delete — Delete a snapshot =====
  app.post<{
    Params: { id: string };
  }>('/api/studio/snapshots/:id/delete', async (req, reply) => {
    if (!snapshotStore) {
      reply.code(501).send({ error: 'Snapshot persistence is not configured.' });
      return;
    }

    const deleted = snapshotStore.delete(req.params.id);
    if (!deleted) {
      reply.code(404).send({ error: 'Snapshot not found.' });
      return;
    }

    const current = snapshotStore.load();
    store.graph = current?.graph ?? null;
    store.risks = current?.risks ?? [];
    store.scanTime = current?.scanTime ?? 0;
    store.source = current?.source ?? '';
    if (store.graph) {
      broadcastGraph();
    }

    return {
      ok: true,
      hasCurrent: Boolean(current?.graph),
      snapshots: snapshotStore.list(),
    };
  });

  // ===== GET /api/studio/roles — List all registered croc roles =====
  app.get('/api/studio/roles', async (req) => {
    const { getRoleRegistry } = await import('../../agents/role-registry.js');
    const registry = getRoleRegistry();
    const category = (req.query as Record<string, string>).category;
    const search = (req.query as Record<string, string>).search;

    let roles = registry.list();
    if (category) roles = roles.filter(r => r.category === category);
    if (search) roles = registry.search(search);

    return {
      total: roles.length,
      categories: {
        core: roles.filter(r => r.category === 'core').length,
        language: roles.filter(r => r.category === 'language').length,
        framework: roles.filter(r => r.category === 'framework').length,
        domain: roles.filter(r => r.category === 'domain').length,
        community: roles.filter(r => r.category === 'community').length,
      },
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        category: r.category,
        description: r.description,
        color: r.color,
        sprite: r.sprite,
        priority: r.priority,
        tags: r.tags,
        outputType: r.outputType,
      })),
    };
  });

  // ===== POST /api/studio/summon — Dynamically summon crocs for current project =====
  app.post('/api/studio/summon', async (_req, reply) => {
    if (!lastScanResult) {
      reply.code(400).send({ error: 'No project scanned. Run /api/studio/scan first.' });
      return;
    }

    const riskCategories = [...new Set(store.risks.map(r => r.category))];
    const plan = await office.summonForProject(lastScanResult, riskCategories);

    return {
      ok: true,
      totalAgents: office.getAgents().length,
      coreAgents: 6,
      dynamicAgents: office.getAgents().length - 6,
      reasoning: plan.reasoning,
      agents: office.getAgents().map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        sprite: a.sprite,
        status: a.status,
        category: a.category,
        color: a.color,
        description: a.description,
      })),
      context: {
        languages: plan.context.languages,
        frameworks: plan.context.frameworks,
        projectType: plan.context.projectType,
        entityCount: plan.context.entityCount,
        hasAPIs: plan.context.hasAPIs,
        hasModels: plan.context.hasModels,
        hasFrontend: plan.context.hasFrontend,
        hasDocker: plan.context.hasDocker,
        hasCI: plan.context.hasCI,
      },
    };
  });

  // ===== GET /api/studio/agents — Current agent roster =====
  app.get('/api/studio/agents', async () => {
    const info = office.getSummonPlan();
    return {
      ...info,
      agents: info.agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        sprite: a.sprite,
        status: a.status,
        currentTask: a.currentTask,
        category: a.category,
        color: a.color,
        description: a.description,
      })),
    };
  });
}
