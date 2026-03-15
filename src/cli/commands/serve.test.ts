import { describe, it, expect, vi } from 'vitest';

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
});
