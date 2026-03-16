import { describe, expect, it } from 'vitest';
import { CrocOffice } from '../croc-office.js';
import { registerStudioRoutes } from './studio.js';
import type {
  StudioProjectStore,
  StudioSnapshotRecord,
  StudioSnapshotStore,
  StudioSnapshotSummary,
} from '../studio-store.js';
import type { KnowledgeGraph } from '../../graph/types.js';

type RouteHandler = (req: any, reply: any) => Promise<any> | any;

class FakeFastify {
  routes = new Map<string, RouteHandler>();

  get(path: string, handler: RouteHandler) {
    this.routes.set(`GET ${path}`, handler);
  }

  post(path: string, handler: RouteHandler) {
    this.routes.set(`POST ${path}`, handler);
  }
}

class FakeReply {
  statusCode = 200;
  payload: unknown;

  code(code: number) {
    this.statusCode = code;
    return this;
  }

  send(payload: unknown) {
    this.payload = payload;
    return payload;
  }
}

class MemoryStudioSnapshotStore implements StudioSnapshotStore {
  private currentSnapshotId: string | null;
  private snapshots: StudioSnapshotRecord[];

  constructor(snapshots: StudioSnapshotRecord[], currentSnapshotId?: string | null) {
    this.snapshots = snapshots;
    this.currentSnapshotId = currentSnapshotId ?? snapshots[0]?.id ?? null;
  }

  load(): StudioProjectStore | null {
    const current = this.snapshots.find((snapshot) => snapshot.id === this.currentSnapshotId);
    return current ? this.toStore(current) : null;
  }

  save(snapshot: StudioProjectStore): void {
    this.snapshots.unshift({
      id: `saved-${Date.now()}`,
      name: snapshot.graph?.projectInfo?.name || snapshot.source || 'snapshot',
      pinned: false,
      tags: [],
      ...snapshot,
    });
    this.currentSnapshotId = this.snapshots[0].id;
  }

  list(): StudioSnapshotSummary[] {
    return this.snapshots.map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      source: snapshot.source,
      scanTime: snapshot.scanTime,
      nodeCount: snapshot.graph?.nodes.length ?? 0,
      riskCount: snapshot.risks.length,
      current: snapshot.id === this.currentSnapshotId,
      pinned: Boolean(snapshot.pinned),
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    })).sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.scanTime - left.scanTime;
    });
  }

  loadById(id: string): StudioProjectStore | null {
    const found = this.snapshots.find((snapshot) => snapshot.id === id);
    if (!found) return null;
    this.currentSnapshotId = id;
    return this.toStore(found);
  }

  rename(id: string, name: string): boolean {
    const found = this.snapshots.find((snapshot) => snapshot.id === id);
    if (!found || !name.trim()) return false;
    found.name = name.trim();
    return true;
  }

  delete(id: string): boolean {
    const next = this.snapshots.filter((snapshot) => snapshot.id !== id);
    if (next.length === this.snapshots.length) return false;
    this.snapshots = next;
    if (this.currentSnapshotId === id) {
      this.currentSnapshotId = this.snapshots[0]?.id ?? null;
    }
    return true;
  }

  pin(id: string, pinned: boolean): boolean {
    const found = this.snapshots.find((snapshot) => snapshot.id === id);
    if (!found) return false;
    found.pinned = pinned;
    return true;
  }

  updateTags(id: string, tags: string[]): boolean {
    const found = this.snapshots.find((snapshot) => snapshot.id === id);
    if (!found) return false;
    found.tags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    return true;
  }

  private toStore(snapshot: StudioSnapshotRecord): StudioProjectStore {
    return {
      graph: snapshot.graph,
      risks: snapshot.risks,
      scanTime: snapshot.scanTime,
      source: snapshot.source,
    };
  }
}

function makeSnapshot(id: string, name: string, source: string, scanTime: number): StudioSnapshotRecord {
  return {
    id,
    name,
    pinned: false,
    tags: [],
    source,
    scanTime,
    risks: [],
    graph: {
      nodes: [{ id: `${id}-node`, label: name, type: 'module', metadata: {} }],
      edges: [],
      projectInfo: {
        name,
        projectType: 'backend-api',
        languages: { ts: 1 },
        frameworks: ['express'],
        source: 'local',
        rootPath: source,
        packageManager: 'npm',
        stats: {
          totalFiles: 1,
          totalLines: 10,
          modules: 1,
          classes: 0,
          functions: 0,
          apiEndpoints: 0,
          dataModels: 0,
          dependencies: 0,
          linesByLanguage: { ts: 10 },
        },
      },
      builtAt: new Date(scanTime).toISOString(),
      buildDuration: 10,
    } as unknown as KnowledgeGraph,
  };
}

function setup(snapshotStore: StudioSnapshotStore) {
  const app = new FakeFastify();
  const office = new CrocOffice({ backendRoot: '.' }, process.cwd());
  registerStudioRoutes(app as any, office, snapshotStore);
  return app;
}

async function call(app: FakeFastify, method: 'GET' | 'POST', path: string, req: any = {}) {
  const handler = app.routes.get(`${method} ${path}`);
  if (!handler) throw new Error(`Route not found: ${method} ${path}`);
  const reply = new FakeReply();
  const result = await handler(req, reply);
  return { result, reply };
}

describe('studio routes snapshot management', () => {
  it('should list, rename, load, and delete snapshots', async () => {
    const snapshotStore = new MemoryStudioSnapshotStore([
      makeSnapshot('snap-2', 'Beta', './beta', 200),
      makeSnapshot('snap-1', 'Alpha', './alpha', 100),
    ], 'snap-2');
    const app = setup(snapshotStore);

    const list = await call(app, 'GET', '/api/studio/snapshots');
    expect((list.result as any).total).toBe(2);
    expect((list.result as any).snapshots[0].current).toBe(true);

    const rename = await call(app, 'POST', '/api/studio/snapshots/:id/rename', {
      params: { id: 'snap-1' },
      body: { name: 'Alpha Renamed' },
    });
    expect((rename.result as any).ok).toBe(true);
    expect((rename.result as any).snapshots.find((item: { id: string }) => item.id === 'snap-1').name).toBe('Alpha Renamed');

    const load = await call(app, 'POST', '/api/studio/snapshots/:id/load', {
      params: { id: 'snap-1' },
    });
    expect((load.result as any).ok).toBe(true);
    expect((load.result as any).source).toBe('./alpha');

    const summary = await call(app, 'GET', '/api/studio/summary');
    expect((summary.result as any).name).toBe('Alpha');

    const del = await call(app, 'POST', '/api/studio/snapshots/:id/delete', {
      params: { id: 'snap-1' },
    });
    expect((del.result as any).ok).toBe(true);
    expect((del.result as any).snapshots).toHaveLength(1);
    expect((del.result as any).hasCurrent).toBe(true);

    const pin = await call(app, 'POST', '/api/studio/snapshots/:id/pin', {
      params: { id: 'snap-2' },
      body: { pinned: true },
    });
    expect((pin.result as any).ok).toBe(true);
    expect((pin.result as any).snapshots[0].pinned).toBe(true);

    const tags = await call(app, 'POST', '/api/studio/snapshots/:id/tags', {
      params: { id: 'snap-2' },
      body: { tags: ['frontend', ' urgent ', 'frontend'] },
    });
    expect((tags.result as any).ok).toBe(true);
    expect((tags.result as any).snapshots[0].tags).toEqual(['frontend', 'urgent']);
  });

  it('should return proper errors for unknown snapshot operations', async () => {
    const app = setup(new MemoryStudioSnapshotStore([], null));

    const load = await call(app, 'POST', '/api/studio/snapshots/:id/load', { params: { id: 'missing' } });
    expect(load.reply.statusCode).toBe(404);
    expect(load.reply.payload).toEqual({ error: 'Snapshot not found.' });

    const rename = await call(app, 'POST', '/api/studio/snapshots/:id/rename', {
      params: { id: 'missing' },
      body: { name: 'x' },
    });
    expect(rename.reply.statusCode).toBe(404);

    const pin = await call(app, 'POST', '/api/studio/snapshots/:id/pin', {
      params: { id: 'missing' },
      body: { pinned: true },
    });
    expect(pin.reply.statusCode).toBe(404);

    const tags = await call(app, 'POST', '/api/studio/snapshots/:id/tags', {
      params: { id: 'missing' },
      body: { tags: ['missing'] },
    });
    expect(tags.reply.statusCode).toBe(404);

    const del = await call(app, 'POST', '/api/studio/snapshots/:id/delete', { params: { id: 'missing' } });
    expect(del.reply.statusCode).toBe(404);
  });
});