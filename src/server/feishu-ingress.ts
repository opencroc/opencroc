import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';
import type { FeishuProgressBridge } from './feishu-bridge.js';
import {
  isComplexRequest,
  startComplexFeishuChatTask,
  type ComplexRequestStartResult,
} from './feishu-task-start.js';

interface FeishuChallengeBody {
  type?: string;
  challenge?: string;
}

interface FeishuEventSender {
  sender_id?: { open_id?: string; union_id?: string; user_id?: string };
  sender_type?: string;
}

interface FeishuEventMessage {
  message_id?: string;
  chat_id?: string;
  message_type?: string;
  content?: string;
}

interface FeishuEventBody {
  type?: string;
  header?: {
    event_type?: string;
    event_id?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    sender?: FeishuEventSender;
    message?: FeishuEventMessage;
  };
}

interface DuplicateResult {
  ok: true;
  ignored: true;
  reason: string;
}

interface PassThroughResult {
  kind: 'pass-through';
  reason: string;
}

function parseTextContent(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.text === 'string') return parsed.text.trim();
  } catch {
    return raw.trim();
  }
  return '';
}

function createDedupKey(body: FeishuEventBody): string | undefined {
  const eventId = body.header?.event_id?.trim();
  if (eventId) return `event:${eventId}`;

  const messageId = body.event?.message?.message_id?.trim();
  if (messageId) return `message:${messageId}`;

  return undefined;
}

export function registerFeishuIngressRoutes(app: FastifyInstance, office: CrocOffice, feishuBridge: FeishuProgressBridge): void {
  const seenEvents = new Map<string, number>();
  const dedupTtlMs = 10 * 60 * 1000;

  app.post<{ Body: FeishuChallengeBody | FeishuEventBody }>('/api/feishu/webhook', async (req, reply) => {
    const body = req.body as FeishuChallengeBody | FeishuEventBody;

    if (body?.type === 'url_verification' && 'challenge' in body) {
      return { challenge: body.challenge };
    }

    const eventType = 'header' in body ? body.header?.event_type : undefined;
    if (eventType !== 'im.message.receive_v1') {
      return {
        ok: true,
        ignored: true,
        reason: `Unsupported event type: ${eventType || 'unknown'}`,
      };
    }

    const dedupKey = createDedupKey(body as FeishuEventBody);
    if (dedupKey) {
      const now = Date.now();
      for (const [key, expiresAt] of seenEvents) {
        if (expiresAt <= now) {
          seenEvents.delete(key);
        }
      }
      const existing = seenEvents.get(dedupKey);
      if (existing && existing > now) {
        const result: DuplicateResult = {
          ok: true,
          ignored: true,
          reason: `Duplicate Feishu delivery ignored: ${dedupKey}`,
        };
        return result;
      }
      seenEvents.set(dedupKey, now + dedupTtlMs);
    }

    const event = (body as FeishuEventBody).event;
    const message = event?.message;
    const text = parseTextContent(message?.content);

    if (!isComplexRequest(text)) {
      const result: PassThroughResult = {
        kind: 'pass-through',
        reason: 'Message does not look like a complex request that should enter task mode.',
      };
      return { ok: true, result };
    }

    const outcome = await startComplexFeishuChatTask(office, feishuBridge, {
      text,
      chatId: message?.chat_id || 'unknown-chat',
      requestId: message?.message_id,
      replyToMessageId: message?.message_id,
      rootMessageId: message?.message_id,
      receiveDetail: 'Task accepted from Feishu webhook',
      understandDetail: 'Understanding request context',
    });

    if (!outcome.ok) {
      return reply.code(502).send({
        ok: false,
        taskId: outcome.taskId,
        error: outcome.error,
        detail: outcome.detail,
      });
    }

    return { ok: true, result: outcome.result };
  });
}
