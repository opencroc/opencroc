import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';
import type { FeishuProgressBridge } from './feishu-bridge.js';
import { isComplexRequest, startComplexFeishuChatTask } from './feishu-task-start.js';

interface FeishuRelayBody {
  chatId?: string;
  text?: string;
  requestId?: string;
  messageId?: string;
  threadId?: string;
  replyToMessageId?: string;
  rootMessageId?: string;
  senderId?: string;
  senderName?: string;
}

export function registerFeishuRelayRoutes(app: FastifyInstance, office: CrocOffice, feishuBridge: FeishuProgressBridge): void {
  app.post<{ Body: FeishuRelayBody }>('/api/feishu/relay', async (req, reply) => {
    const chatId = req.body.chatId?.trim();
    const text = req.body.text?.trim() || '';
    const requestId = req.body.requestId?.trim() || req.body.messageId?.trim();
    const replyToMessageId = req.body.replyToMessageId?.trim() || requestId;
    const rootMessageId = req.body.rootMessageId?.trim() || requestId;

    if (!chatId) {
      return reply.code(400).send({
        ok: false,
        handled: false,
        error: 'chatId is required',
      });
    }

    if (!isComplexRequest(text)) {
      return {
        ok: true,
        handled: false,
        reason: 'Message does not look like a complex request that should enter task mode.',
      };
    }

    const outcome = await startComplexFeishuChatTask(office, feishuBridge, {
      text,
      chatId,
      threadId: req.body.threadId?.trim(),
      requestId,
      replyToMessageId,
      rootMessageId,
      receiveDetail: 'Task accepted from OpenClaw relay',
      understandDetail: 'Understanding relayed OpenClaw request context',
    });

    if (!outcome.ok) {
      return reply.code(502).send({
        ok: false,
        handled: false,
        taskId: outcome.taskId,
        error: outcome.error,
        detail: outcome.detail,
      });
    }

    return {
      ok: true,
      handled: true,
      taskId: outcome.result.taskId,
      dispatch: outcome.result.dispatch,
      suggestedExecution: outcome.result.suggestedExecution,
    };
  });
}
