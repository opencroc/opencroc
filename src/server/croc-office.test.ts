import { describe, it, expect } from 'vitest';
import { CrocOffice } from './croc-office.js';

describe('CrocOffice', () => {
  const config = { backendRoot: './test-fixtures' };

  it('should initialize with default agents', () => {
    const office = new CrocOffice(config, process.cwd());
    const agents = office.getAgents();
    expect(agents).toHaveLength(6);
    expect(agents[0].id).toBe('parser-croc');
    expect(agents[0].status).toBe('idle');
  });

  it('should get agent by id', () => {
    const office = new CrocOffice(config, process.cwd());
    const agent = office.getAgent('tester-croc');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('测试鳄');
    expect(agent!.role).toBe('tester');
  });

  it('should return undefined for unknown agent', () => {
    const office = new CrocOffice(config, process.cwd());
    expect(office.getAgent('unknown')).toBeUndefined();
  });

  it('should update agent status', () => {
    const office = new CrocOffice(config, process.cwd());
    office.updateAgent('parser-croc', { status: 'working', currentTask: 'Parsing models...' });
    const agent = office.getAgent('parser-croc');
    expect(agent!.status).toBe('working');
    expect(agent!.currentTask).toBe('Parsing models...');
  });

  it('should invalidate cache', () => {
    const office = new CrocOffice(config, process.cwd());
    office.invalidateCache();
    // Should not throw
  });

  it('should return project info', async () => {
    const office = new CrocOffice(config, process.cwd());
    const info = await office.getProjectInfo();
    expect(info.backendRoot).toBe('./test-fixtures');
    expect(info.adapter).toBe('custom');
    expect(info.stats).toBeDefined();
    expect(info.agents).toHaveLength(6);
    expect(info.graph).toBeDefined();
  });

  it('should report isRunning as false initially', () => {
    const office = new CrocOffice(config, process.cwd());
    expect(office.isRunning()).toBe(false);
  });

  it('should reset all agents to idle', () => {
    const office = new CrocOffice(config, process.cwd());
    office.updateAgent('parser-croc', { status: 'working', currentTask: 'Scanning...', progress: 50 });
    office.updateAgent('tester-croc', { status: 'done', currentTask: 'Done', progress: 100 });
    office.resetAgents();
    for (const a of office.getAgents()) {
      expect(a.status).toBe('idle');
      expect(a.currentTask).toBeUndefined();
      expect(a.progress).toBeUndefined();
    }
  });

  it('should run scan and return result', async () => {
    const office = new CrocOffice(config, process.cwd());
    const result = await office.runScan();
    expect(result.ok).toBe(true);
    expect(result.task).toBe('scan');
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(office.isRunning()).toBe(false);
  });

  it('should reject concurrent tasks', async () => {
    const office = new CrocOffice(config, process.cwd());
    // Start scan without awaiting
    const p1 = office.runScan();
    // Try to start pipeline while scan is running
    const p2Result = await office.runPipeline();
    expect(p2Result.ok).toBe(false);
    expect(p2Result.error).toContain('Another task');
    await p1;
  });

  it('should expose getConfig and getCwd', () => {
    const office = new CrocOffice(config, process.cwd());
    expect(office.getConfig()).toBe(config);
    expect(office.getCwd()).toBe(process.cwd());
  });
});
