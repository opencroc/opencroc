import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../load-config.js', () => ({
  loadConfig: vi.fn(),
}));

// Mock child_process to avoid actually running Playwright
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { runTests } from './test.js';
import { loadConfig } from '../load-config.js';
import { execFileSync } from 'node:child_process';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedExecFileSync = vi.mocked(execFileSync);

const TMP = join(__dirname, '..', '..', '..', '.test-tmp-runner');

function cleanup(): void {
  rmSync(TMP, { recursive: true, force: true });
}

describe('test command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedLoadConfig.mockResolvedValue({
      config: { backendRoot: './backend', outDir: TMP },
      filepath: '/fake/config.json',
    });
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports no test files when outDir is empty', async () => {
    mkdirSync(TMP, { recursive: true });

    await runTests({});

    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('discovers and runs .spec.ts files', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'auth.spec.ts'), '// test', 'utf-8');

    await runTests({});

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      expect.stringContaining('npx'),
      expect.arrayContaining(['playwright', 'test']),
      expect.any(Object),
    );
  });

  it('passes --headed flag to Playwright', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'crud.spec.ts'), '// test', 'utf-8');

    await runTests({ headed: true });

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['--headed']),
      expect.any(Object),
    );
  });

  it('filters test files by module name', async () => {
    mkdirSync(join(TMP, 'users'), { recursive: true });
    mkdirSync(join(TMP, 'orders'), { recursive: true });
    writeFileSync(join(TMP, 'users', 'user.spec.ts'), '// test', 'utf-8');
    writeFileSync(join(TMP, 'orders', 'order.spec.ts'), '// test', 'utf-8');

    await runTests({ module: 'users' });

    const callArgs = mockedExecFileSync.mock.calls[0][1] as string[];
    const testFiles = callArgs.filter((a) => a.endsWith('.spec.ts'));
    expect(testFiles).toHaveLength(1);
    expect(testFiles[0]).toContain('users');
  });

  it('runs setup/auth/teardown hooks from config', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'auth.spec.ts'), '// test', 'utf-8');

    mockedLoadConfig.mockResolvedValue({
      config: {
        backendRoot: './backend',
        outDir: TMP,
        execution: {
          setupHook: 'echo setup',
          authHook: { command: 'node', args: ['scripts/auth.js'] },
          teardownHook: 'echo teardown',
        },
      },
      filepath: '/fake/config.json',
    });

    await runTests({});

    const calls = mockedExecFileSync.mock.calls.map((c) => c[0]);
    expect(calls.some((cmd) => String(cmd).includes('cmd.exe') || String(cmd).includes('sh'))).toBe(true);
    expect(calls.some((cmd) => String(cmd).includes('node'))).toBe(true);
    expect(calls.some((cmd) => String(cmd).includes('npx'))).toBe(true);
  });

  it('uses CLI hook overrides', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'auth.spec.ts'), '// test', 'utf-8');

    await runTests({
      setupHook: 'echo cli-setup',
      authHook: 'echo cli-auth',
      teardownHook: 'echo cli-teardown',
    });

    const shellCalls = mockedExecFileSync.mock.calls.filter((c) => String(c[0]).includes('cmd') || String(c[0]).includes('sh'));
    expect(shellCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('aborts test execution when setup hook fails', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'auth.spec.ts'), '// test', 'utf-8');

    mockedLoadConfig.mockResolvedValue({
      config: {
        backendRoot: './backend',
        outDir: TMP,
        execution: {
          setupHook: 'echo setup',
          teardownHook: 'echo teardown',
        },
      },
      filepath: '/fake/config.json',
    });

    mockedExecFileSync.mockImplementation((cmd: unknown, args: unknown[]) => {
      if ((String(cmd).includes('cmd') || String(cmd).includes('sh')) && String(args?.[args.length - 1] || '').includes('echo setup')) {
        throw new Error('setup failed');
      }
      return undefined;
    });

    const codeBefore = process.exitCode;
    await runTests({});
    expect(process.exitCode).toBe(1);

    const npxCalls = mockedExecFileSync.mock.calls.filter((c) => String(c[0]).includes('npx'));
    expect(npxCalls).toHaveLength(0);
    process.exitCode = codeBefore;
  });
});
