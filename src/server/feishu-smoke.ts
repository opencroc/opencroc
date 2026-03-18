import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerFeishuSmokeRoutes(app: FastifyInstance, office: CrocOffice): void {
  app.post<{ Body: { chatId: string; requestId?: string; title?: string; mode?: 'text' | 'card' } }>('/api/feishu/smoke/progress', async (req) => {
    const title = req.body.title || 'Feishu progress smoke test';
    const task = office.createChatTask(title);

    office.bindTaskToFeishu(task.id, {
      chatId: req.body.chatId,
      requestId: req.body.requestId,
      replyToMessageId: req.body.requestId,
      rootMessageId: req.body.requestId,
      source: 'feishu',
    });

    void (async () => {
      office.activateTask(task.id);
      office.markTaskRunning('receive', 'Smoke task accepted', 8);
      await wait(1200);
      office.markTaskRunning('understand', 'Verifying Feishu delivery path', 22);
      await wait(1200);
      office.markTaskRunning('gather', 'Sending staged progress updates', 48);
      await wait(1200);
      office.markTaskRunning('generate', 'Preparing final confirmation', 76);
      await wait(1200);
      office.finishTask('Smoke progress flow completed successfully');
      office.activateTask(null);
    })().catch((error) => {
      office.activateTask(task.id);
      office.failTask(error instanceof Error ? error.message : String(error));
      office.activateTask(null);
    });

    return {
      ok: true,
      taskId: task.id,
      message: 'Feishu smoke progress task started',
    };
  });
}
