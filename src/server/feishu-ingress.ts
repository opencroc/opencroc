import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';
import type { FeishuProgressBridge } from './feishu-bridge.js';
import { dispatchChatTask } from './chat-task-dispatcher.js';

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

interface ComplexRequestStartResult {
  kind: 'task-start';
  taskId: string;
  ack: ReturnType<FeishuProgressBridge['createRequestAck']>;
  dispatch: {
    intent: 'pipeline' | 'scan' | 'report' | 'analysis';
    action: 'started' | 'waiting';
    reason: string;
  };
  suggestedExecution: {
    type: 'chat-task';
    nextStage: 'understand' | 'gather';
    suggestedActions: string[];
  };
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

function isComplexRequest(text: string): boolean {
  if (!text) return false;
  if (text.length >= 24) return true;
  const keywords = [
    '分析', '设计', '规划', 'roadmap', '架构', '方案', '拆解', '仓库', '项目', '测试', 'report', 'pipeline', 'scan',
    'analyze', 'design', 'plan', 'review', 'refactor', 'generate', 'complex', 'task',
  ];
  return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
}

function buildTitle(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Feishu complex task';
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}

export function registerFeishuIngressRoutes(app: FastifyInstance, office: CrocOffice, feishuBridge: FeishuProgressBridge): void {
  app.post<{ Body: FeishuChallengeBody | FeishuEventBody }>('/api/feishu/webhook', async (req) => {
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

    const task = office.createChatTask(buildTitle(text));
    office.bindTaskToFeishu(task.id, {
      chatId: message?.chat_id || 'unknown-chat',
      requestId: message?.message_id,
      replyToMessageId: message?.message_id,
      rootMessageId: message?.message_id,
      source: 'feishu',
    });

    office.activateTask(task.id);
    office.markTaskRunning('receive', 'Task accepted from Feishu webhook', 8);
    office.markTaskRunning('understand', 'Understanding request context', 15);
    office.activateTask(null);

    const ack = feishuBridge.createRequestAck(task.id, {
      title: task.title,
      target: {
        chatId: message?.chat_id || 'unknown-chat',
        requestId: message?.message_id,
        source: 'feishu',
      },
      kind: 'chat',
      initialProgress: 15,
      stage: '理解问题',
      detail: '已收到复杂请求，正在进入任务执行态',
    });

    const dispatch = await dispatchChatTask(office, task.id, text);

    const result: ComplexRequestStartResult = {
      kind: 'task-start',
      taskId: task.id,
      ack,
      dispatch: {
        intent: dispatch.plan.intent,
        action: dispatch.action,
        reason: dispatch.plan.reason,
      },
      suggestedExecution: {
        type: 'chat-task',
        nextStage: dispatch.action === 'waiting' ? 'gather' : 'understand',
        suggestedActions: dispatch.action === 'waiting'
          ? ['await-decision', 'resume-chat-task']
          : ['run-linked-task-flow', 'stream-progress-back-to-feishu'],
      },
    };

    return { ok: true, result };
  });
}
