import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from '../croc-office.js';
import type { ExecutionRunMode } from '../../execution/types.js';
import type { TaskDecisionPrompt } from '../task-store.js';
export function registerAgentRoutes(app: FastifyInstance, office: CrocOffice): void {
  // GET /api/agents — list all croc agents
  app.get('/api/agents', async () => {
    return office.getAgents();
  });

  // GET /api/agents/:id — get specific agent
  app.get<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const agent = office.getAgent(req.params.id);
    if (!agent) {
      reply.code(404).send({ error: 'Agent not found' });
      return;
    }
    return agent;
  });

  // POST /api/scan — trigger project scan (parser croc)
  app.post('/api/scan', async (_req, reply) => {
    if (office.isRunning()) {
      reply.code(409).send({ error: 'A task is already running' });
      return;
    }
    const previewTask = office.createTask('scan', 'Scan project and build knowledge graph', [
      { key: 'receive', label: 'Receive task' },
      { key: 'scan', label: 'Scan project structure' },
      { key: 'graph', label: 'Build knowledge graph' },
      { key: 'report', label: 'Summarize result' },
    ]);
    office.activateTask(previewTask.id);
    office.markTaskRunning('receive', 'Task accepted from API', 2);
    office.activateTask(null);
    office.runScan().catch(() => { /* errors handled in runScan */ });
    return { ok: true, message: 'Scan started', taskId: previewTask.id };
  });

  // POST /api/pipeline — trigger full pipeline (all crocs)
  app.post('/api/pipeline', async (_req, reply) => {
    if (office.isRunning()) {
      reply.code(409).send({ error: 'A task is already running' });
      return;
    }
    const previewTask = office.createTask('pipeline', 'Run source-aware pipeline and generate outputs', [
      { key: 'receive', label: 'Receive task' },
      { key: 'scan', label: 'Scan codebase and ER structures' },
      { key: 'analyze', label: 'Analyze API chains' },
      { key: 'plan', label: 'Plan test chains' },
      { key: 'codegen', label: 'Generate test code' },
      { key: 'report', label: 'Validate and summarize' },
    ]);
    office.activateTask(previewTask.id);
    office.markTaskRunning('receive', 'Task accepted from API', 2);
    office.activateTask(null);
    office.runPipeline().catch(() => { /* errors handled in runPipeline */ });
    return { ok: true, message: 'Pipeline started', taskId: previewTask.id };
  });

  // POST /api/reset — reset all agents to idle
  app.post('/api/reset', async () => {
    office.resetAgents();
    return { ok: true };
  });

  // GET /api/status — overall status
  app.get('/api/status', async () => {
    return {
      running: office.isRunning(),
      agents: office.getAgents(),
      activeTask: office.listTasks(1)[0] ?? null,
    };
  });

  // GET /api/tasks — recent tasks
  app.get<{ Querystring: { limit?: string } }>('/api/tasks', async (req) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    return {
      ok: true,
      tasks: office.listTasks(Number.isFinite(limit) ? limit : 20),
    };
  });

  // GET /api/tasks/:id — single task detail
  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const task = office.getTask(req.params.id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }
    return { ok: true, task };
  });

  // POST /api/feishu/tasks/start — create a chat task for a complex Feishu request and return immediate ACK payload
  app.post<{ Body: { title: string; chatId: string; threadId?: string; requestId?: string; detail?: string } }>('/api/feishu/tasks/start', async (req) => {
    const task = office.createChatTask(req.body.title);
    office.bindTaskToFeishu(task.id, {
      chatId: req.body.chatId,
      threadId: req.body.threadId,
      requestId: req.body.requestId,
      source: 'feishu',
    });

    office.activateTask(task.id);
    office.markTaskRunning('receive', req.body.detail || 'Task accepted from Feishu', 8);
    office.activateTask(null);

    const ack = feishuBridge.createRequestAck(task.id, {
      title: task.title,
      target: {
        chatId: req.body.chatId,
        threadId: req.body.threadId,
        requestId: req.body.requestId,
        source: 'feishu',
      },
      kind: task.kind,
      initialProgress: 8,
      stage: '接收任务',
      detail: req.body.detail || '已收到，正在处理复杂请求',
    });

    return ack;
  });

  // POST /api/feishu/tasks/ack — skeleton endpoint for Feishu complex-request ACK + task binding
  app.post<{ Body: { taskId: string; chatId: string; threadId?: string; requestId?: string; title?: string; stage?: string; detail?: string } }>('/api/feishu/tasks/ack', async (req, reply) => {
    const task = office.getTask(req.body.taskId);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }

    office.bindTaskToFeishu(task.id, {
      chatId: req.body.chatId,
      threadId: req.body.threadId,
      requestId: req.body.requestId,
      source: 'feishu',
    });

    const ack = feishuBridge.createRequestAck(task.id, {
      title: req.body.title || task.title,
      target: {
        chatId: req.body.chatId,
        threadId: req.body.threadId,
        requestId: req.body.requestId,
        source: 'feishu',
      },
      kind: task.kind,
      initialProgress: task.progress,
      stage: req.body.stage,
      detail: req.body.detail || 'Task accepted from Feishu bridge',
    });

    return ack;
  });

  // POST /api/feishu/tasks/:id/waiting — set task into waiting/decision state for Feishu follow-up
  app.post<{ Params: { id: string }; Body: { waitingFor: string; detail: string; progress?: number; decision?: TaskDecisionPrompt } }>('/api/feishu/tasks/:id/waiting', async (req, reply) => {
    const task = office.getTask(req.params.id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }

    office.activateTask(task.id);
    office.waitOnTask(req.body.waitingFor, req.body.detail, req.body.progress ?? task.progress, req.body.decision);
    office.activateTask(null);

    return { ok: true, task: office.getTask(task.id) };
  });

  // GET /api/files — generated test files from last pipeline run
  app.get('/api/files', async () => {
    const files = office.getGeneratedFiles();
    return files.map(f => ({
      filePath: f.filePath,
      module: f.module,
      chain: f.chain,
      lines: f.content.split('\n').length,
      size: f.content.length,
    }));
  });

  // GET /api/files/:index — get content of a specific generated file
  app.get<{ Params: { index: string } }>('/api/files/:index', async (req, reply) => {
    const files = office.getGeneratedFiles();
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= files.length) {
      reply.code(404).send({ error: 'File not found' });
      return;
    }
    return files[idx];
  });

  // GET /api/pipeline/result — last pipeline result summary
  app.get('/api/pipeline/result', async () => {
    const result = office.getLastPipelineResult();
    if (!result) return { ok: false, message: 'No pipeline has been run yet' };
    return {
      ok: true,
      modules: result.modules,
      erDiagramCount: result.erDiagrams.size,
      chainCount: [...result.chainPlans.values()].reduce((s, p) => s + p.chains.length, 0),
      totalSteps: [...result.chainPlans.values()].reduce((s, p) => s + p.totalSteps, 0),
      filesGenerated: result.generatedFiles.length,
      validationErrors: result.validationErrors.length,
      duration: result.duration,
    };
  });

  // POST /api/run-tests — execute generated tests with Playwright
  app.post<{ Body: { mode?: ExecutionRunMode } }>('/api/run-tests', async (req, reply) => {
    if (office.isRunning()) {
      reply.code(409).send({ error: 'A task is already running' });
      return;
    }
    const mode = req.body?.mode;
    if (mode && !['auto', 'reuse', 'managed'].includes(mode)) {
      reply.code(400).send({ error: 'Invalid mode. Valid values: auto, reuse, managed' });
      return;
    }
    const previewTask = office.createTask('execute', 'Execute generated tests and collect results', [
      { key: 'receive', label: 'Receive task' },
      { key: 'prepare', label: 'Prepare runtime and test files' },
      { key: 'backend', label: 'Prepare backend and auth' },
      { key: 'execute', label: 'Run Playwright tests' },
      { key: 'analyze', label: 'Analyze failures and summarize' },
    ]);
    office.activateTask(previewTask.id);
    office.markTaskRunning('receive', 'Task accepted from API', 2);
    office.activateTask(null);
    office.runTests({ mode }).catch(() => { /* errors handled internally */ });
    return { ok: true, message: 'Test execution started', taskId: previewTask.id };
  });

  // GET /api/test-results — last test execution metrics
  app.get('/api/test-results', async () => {
    const metrics = office.getLastExecutionMetrics();
    const quality = office.getLastExecutionQuality();
    if (!metrics && !quality) return { ok: false, message: 'No tests have been run yet' };
    if (!metrics) {
      return { ok: true, metrics: null, total: 0, quality };
    }
    const total = metrics.passed + metrics.failed + metrics.skipped + metrics.timedOut;
    return { ok: true, metrics, total, quality };
  });

  // POST /api/reports/generate — generate reports from last pipeline result
  app.post('/api/reports/generate', async (_req, reply) => {
    if (office.isRunning()) {
      reply.code(409).send({ error: 'A task is already running' });
      return;
    }
    const previewTask = office.createTask('report', 'Generate multi-format project reports', [
      { key: 'receive', label: 'Receive task' },
      { key: 'generate', label: 'Generate reports' },
      { key: 'write', label: 'Write report files' },
      { key: 'publish', label: 'Publish report metadata' },
    ]);
    office.activateTask(previewTask.id);
    office.markTaskRunning('receive', 'Task accepted from API', 2);
    office.activateTask(null);
    office.generateReport().catch(() => { /* errors handled internally */ });
    return { ok: true, message: 'Report generation started', taskId: previewTask.id };
  });

  // GET /api/reports — list last generated reports
  app.get('/api/reports', async () => {
    const reports = office.getLastReports();
    if (reports.length === 0) return { ok: false, message: 'No reports generated yet' };
    return {
      ok: true,
      reports: reports.map(r => ({
        format: r.format,
        filename: r.filename,
        size: r.content.length,
      })),
    };
  });

  // GET /api/reports/:format — get report content by format (html|json|markdown)
  app.get<{ Params: { format: string } }>('/api/reports/:format', async (req, reply) => {
    const reports = office.getLastReports();
    const report = reports.find(r => r.format === req.params.format);
    if (!report) {
      reply.code(404).send({ error: `No ${req.params.format} report found` });
      return;
    }
    const contentType = req.params.format === 'html' ? 'text/html'
      : req.params.format === 'json' ? 'application/json'
      : 'text/markdown';
    reply.type(contentType).send(report.content);
  });

  // GET /api/ci/template — generate CI config template
  app.get<{ Querystring: { provider?: string } }>('/api/ci/template', async (req) => {
    const provider = req.query.provider || 'github';
    const { generateGitHubActionsTemplate, generateGitLabCITemplate } = await import('../../ci/index.js');
    if (provider === 'gitlab') {
      return { ok: true, provider: 'gitlab', template: generateGitLabCITemplate() };
    }
    return { ok: true, provider: 'github', template: generateGitHubActionsTemplate() };
  });
}
