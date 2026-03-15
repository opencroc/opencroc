import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from '../croc-office.js';

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
    // Run async — don't await, respond immediately
    office.runScan().catch(() => { /* errors handled in runScan */ });
    return { ok: true, message: 'Scan started' };
  });

  // POST /api/pipeline — trigger full pipeline (all crocs)
  app.post('/api/pipeline', async (_req, reply) => {
    if (office.isRunning()) {
      reply.code(409).send({ error: 'A task is already running' });
      return;
    }
    office.runPipeline().catch(() => { /* errors handled in runPipeline */ });
    return { ok: true, message: 'Pipeline started' };
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
    };
  });
}
