import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('serve command', () => {
  it('should export serve function', async () => {
    const mod = await import('./serve.js');
    expect(typeof mod.serve).toBe('function');
  });

  it('should fall back to defaults without config', async () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('./serve.js');

    // serve will try to load config from cwd — without config it should fall back gracefully
    // It will attempt to start server which may fail on port binding, but should not set exitCode=1
    try {
      await mod.serve({ port: '0', open: false });
    } catch {
      // Server start may fail in test environment — that's fine
    }

    // Should NOT set exitCode=1 (no longer errors on missing config)
    expect(process.exitCode).not.toBe(1);
    warnSpy.mockRestore();
  });

  it('should include Studio interaction controls in the page template', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/web/index-studio.html'), 'utf-8');
    expect(html).toContain('id="report-toolbar"');
    expect(html).toContain('onclick="focusOnSelectedNode()"');
    expect(html).toContain('function retryCurrentReport()');
    expect(html).toContain('event-log-filter');
    expect(html).toContain('id="snapshot-section"');
    expect(html).toContain('function restoreSnapshot(snapshotId)');
    expect(html).toContain('function renameSnapshot(snapshotId)');
    expect(html).toContain('function deleteSnapshot(snapshotId)');
    expect(html).toContain('id="snapshot-search"');
    expect(html).toContain('function togglePinSnapshot(snapshotId, pinned)');
    expect(html).toContain('id="snapshot-tag-filters"');
    expect(html).toContain('function editSnapshotTags(snapshotId)');
    expect(html).toContain('let activeSnapshotTags = []');
    expect(html).toContain('data-role="snapshot-filter"');
  });
});
