import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStudioSnapshotStore, type StudioProjectStore } from './studio-store.js';
import type { KnowledgeGraph, RiskAnnotation } from '../graph/types.js';

const tempRoots: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `opencroc-studio-store-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('FileStudioSnapshotStore', () => {
  it('should save and load a studio snapshot', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'studio-snapshot.json');
    const store = new FileStudioSnapshotStore(filePath);
    const snapshot: StudioProjectStore = {
      graph: {
        nodes: [{ id: 'n1', label: 'Users', type: 'model', module: 'core', metadata: {} }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', relation: 'depends-on' }],
        projectInfo: {
          name: 'demo',
          projectType: 'backend-api',
          languages: { ts: 1 },
          frameworks: ['express'],
          source: 'local',
          rootPath: './backend',
          packageManager: 'npm',
          stats: {
            totalFiles: 1,
            totalLines: 10,
            modules: 1,
            classes: 0,
            functions: 0,
            apiEndpoints: 0,
            dataModels: 1,
            dependencies: 0,
            linesByLanguage: { ts: 10 },
          },
        },
        builtAt: new Date().toISOString(),
        buildDuration: 12,
      } as unknown as KnowledgeGraph,
      risks: [{
        id: 'risk-1',
        category: 'maintainability',
        severity: 'medium',
        title: 'Tight coupling',
        description: 'demo',
        suggestion: 'refactor',
        affectedNodes: ['n1'],
        confidence: 0.8,
      }] as RiskAnnotation[],
      scanTime: 123,
      source: './backend',
    };

    store.save(snapshot);

    expect(existsSync(filePath)).toBe(true);
    expect(store.load()).toEqual(snapshot);
  });

  it('should list snapshots and restore a specific snapshot', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'studio-snapshot.json');
    const store = new FileStudioSnapshotStore(filePath, 5);

    store.save({ graph: null, risks: [], scanTime: 100, source: './alpha' });
    store.save({ graph: null, risks: [], scanTime: 200, source: './beta' });

    const snapshots = store.list();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].source).toBe('./beta');
    expect(snapshots[0].current).toBe(true);
    expect(snapshots[1].current).toBe(false);

    const restored = store.loadById(snapshots[1].id);
    expect(restored).toEqual({ graph: null, risks: [], scanTime: 100, source: './alpha' });

    const refreshed = store.list();
    const active = refreshed.find((item) => item.id === snapshots[1].id);
    expect(active?.current).toBe(true);
  });

  it('should rename and delete snapshots', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'studio-snapshot.json');
    const store = new FileStudioSnapshotStore(filePath, 5);

    store.save({ graph: null, risks: [], scanTime: 100, source: './alpha' });
    store.save({ graph: null, risks: [], scanTime: 200, source: './beta' });

    const snapshots = store.list();
    expect(store.rename(snapshots[1].id, 'Alpha Renamed')).toBe(true);
    expect(store.list().find((item) => item.id === snapshots[1].id)?.name).toBe('Alpha Renamed');

    expect(store.delete(snapshots[0].id)).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.load()).toEqual({ graph: null, risks: [], scanTime: 100, source: './alpha' });
  });

  it('should pin snapshots and sort pinned items first', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'studio-snapshot.json');
    const store = new FileStudioSnapshotStore(filePath, 5);

    store.save({ graph: null, risks: [], scanTime: 100, source: './alpha' });
    store.save({ graph: null, risks: [], scanTime: 200, source: './beta' });
    const snapshots = store.list();

    expect(store.pin(snapshots[1].id, true)).toBe(true);
    const pinned = store.list();
    expect(pinned[0].id).toBe(snapshots[1].id);
    expect(pinned[0].pinned).toBe(true);
    expect(pinned[1].pinned).toBe(false);
  });

  it('should update snapshot tags and expose them in the summary', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'studio-snapshot.json');
    const store = new FileStudioSnapshotStore(filePath, 5);

    store.save({ graph: null, risks: [], scanTime: 100, source: './alpha' });
    const snapshot = store.list()[0];

    expect(store.updateTags(snapshot.id, ['backend', ' critical ', 'backend', ''])).toBe(true);

    expect(store.list()[0].tags).toEqual(['backend', 'critical']);
  });

  it('should return null when snapshot file does not exist', () => {
    const dir = makeTempDir();
    const store = new FileStudioSnapshotStore(join(dir, 'missing.json'));
    expect(store.load()).toBeNull();
  });

  it('should return null for invalid snapshot json', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'broken.json');
    writeFileSync(filePath, '{not-valid-json', 'utf-8');

    const store = new FileStudioSnapshotStore(filePath);
    expect(store.load()).toBeNull();
  });

  it('should read legacy single-snapshot format', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'legacy.json');
    writeFileSync(filePath, JSON.stringify({ graph: null, risks: [], scanTime: 321, source: './legacy' }), 'utf-8');

    const store = new FileStudioSnapshotStore(filePath);
    expect(store.load()).toEqual({ graph: null, risks: [], scanTime: 321, source: './legacy' });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].source).toBe('./legacy');
    expect(store.list()[0].pinned).toBe(false);
    expect(store.list()[0].tags).toEqual([]);
  });
});