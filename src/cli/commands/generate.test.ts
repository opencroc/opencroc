import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the generate module's parseSteps logic indirectly via generate()
// and test writeGeneratedFiles / printSummary behavior through the full flow

// We mock loadConfig and createPipeline to isolate the CLI command
vi.mock('../load-config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../pipeline/index.js', () => ({
  createPipeline: vi.fn(),
}));

import { generate } from './generate.js';
import { loadConfig } from '../load-config.js';
import { createPipeline } from '../../pipeline/index.js';
import type { PipelineRunResult } from '../../types.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedCreatePipeline = vi.mocked(createPipeline);

function makeMockResult(overrides?: Partial<PipelineRunResult>): PipelineRunResult {
  return {
    modules: ['auth'],
    erDiagrams: new Map(),
    chainPlans: new Map(),
    generatedFiles: [],
    validationErrors: [],
    duration: 42,
    ...overrides,
  };
}

describe('generate command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedLoadConfig.mockResolvedValue({
      config: { backendRoot: './backend' },
      filepath: '/fake/opencroc.config.json',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs pipeline with default steps', async () => {
    const mockRun = vi.fn().mockResolvedValue(makeMockResult());
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await generate({ all: true });

    expect(mockedLoadConfig).toHaveBeenCalled();
    expect(mockedCreatePipeline).toHaveBeenCalledWith({ backendRoot: './backend' });
    expect(mockRun).toHaveBeenCalledWith(undefined);
  });

  it('passes --module filter to config', async () => {
    const mockRun = vi.fn().mockResolvedValue(makeMockResult());
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await generate({ module: 'users' });

    const configArg = mockedCreatePipeline.mock.calls[0][0];
    expect(configArg.modules).toEqual(['users']);
  });

  it('parses --steps to pipeline steps', async () => {
    const mockRun = vi.fn().mockResolvedValue(makeMockResult());
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await generate({ steps: 'scan,er-diagram' });

    expect(mockRun).toHaveBeenCalledWith(['scan', 'er-diagram']);
  });

  it('rejects invalid --steps', async () => {
    const mockRun = vi.fn().mockResolvedValue(makeMockResult());
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await expect(generate({ steps: 'scan,nope' })).rejects.toThrow('Unknown pipeline step "nope"');
  });

  it('dry-run does not write files', async () => {
    const result = makeMockResult({
      generatedFiles: [
        { filePath: '/tmp/test.ts', content: '// test', module: 'auth', chain: 'crud' },
      ],
    });
    const mockRun = vi.fn().mockResolvedValue(result);
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await generate({ dryRun: true });

    // No actual file write — just console output (we don't check fs, just no throw)
    expect(mockRun).toHaveBeenCalled();
  });
});
