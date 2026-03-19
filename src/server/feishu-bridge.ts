import type { TaskDecisionPrompt, TaskEvent, TaskRecord } from './task-store.js';

export interface FeishuBridgeConfig {
  enabled?: boolean;
  baseTaskUrl?: string;
  progressThrottlePercent?: number;
  appId?: string;
  appSecret?: string;
  tenantAccessToken?: string;
  apiBaseUrl?: string;
  mode?: 'mock' | 'live';
  messageFormat?: 'text' | 'card';
}

export interface FeishuTaskTarget {
  chatId: string;
  threadId?: string;
  requestId?: string;
  replyToMessageId?: string;
  rootMessageId?: string;
  source?: 'feishu';
}

export interface FeishuCardPayload {
  schema: '2.0';
  config?: {
    wide_screen_mode?: boolean;
    update_multi?: boolean;
  };
  header: {
    title: { tag: 'plain_text'; content: string };
    template?: 'blue' | 'wathet' | 'turquoise' | 'green' | 'yellow' | 'orange' | 'red' | 'grey' | 'indigo' | 'purple';
  };
  elements: Array<Record<string, unknown>>;
}

export interface FeishuOutboundMessage {
  kind: 'task-ack' | 'task-progress' | 'task-waiting' | 'task-complete' | 'task-failed';
  target: FeishuTaskTarget;
  taskId: string;
  text: string;
  progress: number;
  status: TaskRecord['status'];
  stage?: string;
  detail?: string;
  link?: string;
  decision?: TaskDecisionPrompt;
  card?: FeishuCardPayload;
}

export interface FeishuDeliveryReceipt {
  messageId?: string;
  rootId?: string;
  threadId?: string;
}

export interface FeishuBridgeDelivery {
  send(message: FeishuOutboundMessage): Promise<FeishuDeliveryReceipt | void>;
}

export interface FeishuTaskRequest {
  title: string;
  target: FeishuTaskTarget;
  kind?: string;
  initialProgress?: number;
  stage?: string;
  detail?: string;
  link?: string;
}

export interface FeishuTaskRequestAck {
  ok: true;
  taskId: string;
  message: FeishuOutboundMessage;
}

interface TaskSubscription {
  target: FeishuTaskTarget;
  lastProgressSent: number;
  lastEventType?: TaskEvent['type'];
  ackSent: boolean;
  firstMessageId?: string;
  lastMessageId?: string;
  rootId?: string;
  threadId?: string;
  replyToMessageId?: string;
}

type DeliveryQueue = Promise<void>;

function formatTaskLink(baseTaskUrl: string | undefined, taskId: string): string | undefined {
  if (!baseTaskUrl) return undefined;
  return `${baseTaskUrl.replace(/\/$/, '')}/tasks/${taskId}`;
}

function formatStage(task: TaskRecord): string | undefined {
  const current = task.stages.find((stage) => stage.key === task.currentStageKey);
  return current?.label;
}

function formatAckText(task: TaskRecord, link?: string): string {
  const stage = formatStage(task);
  const parts = [
    `任务已开始：${task.title}`,
    `进度：${task.progress}%`,
    stage ? `当前阶段：${stage}` : undefined,
    link ? `详情：${link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatProgressText(task: TaskRecord, link?: string): string {
  const stage = formatStage(task);
  const latest = task.events[task.events.length - 1];
  const parts = [
    `任务进度更新：${task.title}`,
    `进度：${task.progress}%`,
    stage ? `当前阶段：${stage}` : undefined,
    latest?.message ? `状态：${latest.message}` : undefined,
    link ? `详情：${link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatDecision(decision: TaskDecisionPrompt | undefined): string | undefined {
  if (!decision || decision.options.length === 0) return undefined;
  const lines = [decision.prompt];
  for (const option of decision.options) {
    lines.push(`${option.id}. ${option.label}${option.description ? ` - ${option.description}` : ''}`);
  }
  return lines.join('\n');
}

function formatWaitingText(task: TaskRecord, link?: string): string {
  const latest = task.events[task.events.length - 1];
  const decisionText = formatDecision(task.decision);
  const parts = [
    `任务等待确认：${task.title}`,
    `当前状态：${latest?.message || task.waitingFor || '等待用户输入'}`,
    decisionText,
    link ? `详情：${link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatCompleteText(task: TaskRecord, link?: string): string {
  const parts = [
    `任务已完成：${task.title}`,
    task.summary ? `结果：${task.summary}` : undefined,
    link ? `详情：${link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatFailedText(task: TaskRecord, link?: string): string {
  const latest = [...task.events].reverse().find((event) => event.type === 'failed' || event.level === 'error');
  const parts = [
    `任务执行失败：${task.title}`,
    latest?.message ? `原因：${latest.message}` : undefined,
    link ? `详情：${link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatRequestAckText(request: FeishuTaskRequest, taskId: string): string {
  const parts = [
    `已收到复杂请求：${request.title}`,
    `taskId：${taskId}`,
    request.stage ? `当前阶段：${request.stage}` : undefined,
    request.detail ? `状态：${request.detail}` : undefined,
    request.link ? `详情：${request.link}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function progressBar(progress: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(progress / 10)));
  return `${'■'.repeat(filled)}${'□'.repeat(10 - filled)} ${progress}%`;
}

function cardTemplateForStatus(status: TaskRecord['status']): FeishuCardPayload['header']['template'] {
  switch (status) {
    case 'done': return 'green';
    case 'failed': return 'red';
    case 'waiting': return 'orange';
    case 'running': return 'blue';
    default: return 'wathet';
  }
}

function createTaskCard(message: FeishuOutboundMessage): FeishuCardPayload {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**任务 ID**：${message.taskId}\n**进度**：${progressBar(message.progress)}`,
      },
    },
  ];

  if (message.stage || message.detail) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: [
          message.stage ? `**当前阶段**：${message.stage}` : undefined,
          message.detail ? `**状态**：${message.detail}` : undefined,
        ].filter(Boolean).join('\n'),
      },
    });
  }

  if (message.decision?.options?.length) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**待确认**：${message.decision.prompt}\n${message.decision.options.map((opt) => `${opt.id}. ${opt.label}${opt.description ? ` - ${opt.description}` : ''}`).join('\n')}`,
      },
    });
  }

  if (message.link) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '查看任务详情' },
          type: 'primary',
          url: message.link,
        },
      ],
    });
  }

  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: message.kind === 'task-ack'
          ? `任务已开始：${message.taskId}`
          : message.kind === 'task-waiting'
            ? `任务等待确认：${message.taskId}`
            : message.kind === 'task-complete'
              ? `任务已完成：${message.taskId}`
              : message.kind === 'task-failed'
                ? `任务执行失败：${message.taskId}`
                : `任务进度更新：${message.taskId}`,
      },
      template: cardTemplateForStatus(message.status),
    },
    elements,
  };
}

export class FeishuProgressBridge {
  private enqueueDelivery(taskId: string, deliver: () => Promise<void>): Promise<void> {
    const previous = this.deliveryQueues.get(taskId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(deliver);
    const tracked = next.finally(() => {
      if (this.deliveryQueues.get(taskId) === tracked) {
        this.deliveryQueues.delete(taskId);
      }
    });
    this.deliveryQueues.set(taskId, tracked);
    return tracked;
  }

  private withReplyContext(taskId: string, message: FeishuOutboundMessage): FeishuOutboundMessage {
    const subscription = this.subscriptions.get(taskId);
    if (!subscription) return message;

    const replyToMessageId = subscription.firstMessageId ?? subscription.replyToMessageId;
    const rootMessageId = subscription.rootId ?? subscription.firstMessageId ?? subscription.target.rootMessageId;
    return {
      ...message,
      target: {
        ...message.target,
        threadId: subscription.threadId ?? message.target.threadId,
        replyToMessageId,
        rootMessageId,
      },
    };
  }

  private withMessageFormat(message: FeishuOutboundMessage): FeishuOutboundMessage {
    if (this.config.messageFormat !== 'card') return message;
    if (message.kind === 'task-progress') return message;
    return {
      ...message,
      card: message.card ?? createTaskCard(message),
    };
  }

  private async sendAndTrack(taskId: string, message: FeishuOutboundMessage): Promise<void> {
    const receipt = await this.delivery.send(this.withReplyContext(taskId, this.withMessageFormat(message)));
    const subscription = this.subscriptions.get(taskId);
    if (!subscription || !receipt) return;
    subscription.firstMessageId ??= receipt.messageId;
    subscription.lastMessageId = receipt.messageId ?? subscription.lastMessageId;
    subscription.rootId = receipt.rootId ?? subscription.rootId ?? subscription.firstMessageId;
    subscription.threadId = receipt.threadId ?? subscription.threadId;
    subscription.replyToMessageId = subscription.firstMessageId ?? subscription.replyToMessageId;
  }

  private readonly delivery: FeishuBridgeDelivery;
  private readonly config: Required<Pick<FeishuBridgeConfig, 'progressThrottlePercent'>> & Omit<FeishuBridgeConfig, 'progressThrottlePercent'>;
  private readonly subscriptions = new Map<string, TaskSubscription>();
  private readonly deliveryQueues = new Map<string, DeliveryQueue>();

  constructor(delivery: FeishuBridgeDelivery, config: FeishuBridgeConfig = {}) {
    this.delivery = delivery;
    this.config = {
      enabled: config.enabled ?? true,
      baseTaskUrl: config.baseTaskUrl,
      progressThrottlePercent: config.progressThrottlePercent ?? 15,
      appId: config.appId,
      appSecret: config.appSecret,
      tenantAccessToken: config.tenantAccessToken,
      apiBaseUrl: config.apiBaseUrl,
      mode: config.mode,
      messageFormat: config.messageFormat,
    };
  }

  bindTask(taskId: string, target: FeishuTaskTarget): void {
    this.subscriptions.set(taskId, {
      target,
      lastProgressSent: -1,
      ackSent: false,
      threadId: target.threadId,
      rootId: target.rootMessageId,
      replyToMessageId: target.replyToMessageId ?? target.requestId,
    });
  }

  unbindTask(taskId: string): void {
    this.subscriptions.delete(taskId);
    this.deliveryQueues.delete(taskId);
  }

  getTaskBinding(taskId: string): { target: FeishuTaskTarget; firstMessageId?: string; lastMessageId?: string; rootId?: string; threadId?: string; replyToMessageId?: string } | undefined {
    const subscription = this.subscriptions.get(taskId);
    if (!subscription) return undefined;
    return {
      target: subscription.target,
      firstMessageId: subscription.firstMessageId,
      lastMessageId: subscription.lastMessageId,
      rootId: subscription.rootId,
      threadId: subscription.threadId,
      replyToMessageId: subscription.replyToMessageId,
    };
  }

  createRequestAck(taskId: string, request: FeishuTaskRequest): FeishuTaskRequestAck {
    const link = request.link ?? formatTaskLink(this.config.baseTaskUrl, taskId);
    const message: FeishuOutboundMessage = {
      kind: 'task-ack',
      target: request.target,
      taskId,
      text: formatRequestAckText({ ...request, link }, taskId),
      progress: request.initialProgress ?? 0,
      status: 'queued',
      stage: request.stage,
      detail: request.detail,
      link,
    };
    if (this.config.messageFormat === 'card') {
      message.card = createTaskCard(message);
    }
    return {
      ok: true,
      taskId,
      message,
    };
  }

  async sendRequestAck(taskId: string, request: FeishuTaskRequest): Promise<FeishuTaskRequestAck> {
    if (!this.subscriptions.has(taskId)) {
      this.bindTask(taskId, request.target);
    }
    const ack = this.createRequestAck(taskId, request);
    const receipt = await this.delivery.send(this.withReplyContext(taskId, this.withMessageFormat(ack.message)));
    const subscription = this.subscriptions.get(taskId);
    if (subscription && receipt) {
      subscription.firstMessageId ??= receipt.messageId;
      subscription.lastMessageId = receipt.messageId ?? subscription.lastMessageId;
      subscription.rootId = receipt.rootId ?? subscription.rootId ?? subscription.firstMessageId;
      subscription.threadId = receipt.threadId ?? subscription.threadId;
      subscription.replyToMessageId = subscription.firstMessageId ?? subscription.replyToMessageId;
    }
    return ack;
  }

  async handleTaskUpdate(task: TaskRecord): Promise<void> {
    return this.enqueueDelivery(task.id, async () => {
      if (!this.config.enabled) return;
      const subscription = this.subscriptions.get(task.id);
      if (!subscription) return;

      const link = formatTaskLink(this.config.baseTaskUrl, task.id);
      const latest = task.events[task.events.length - 1];
      const stage = formatStage(task);

      // Ignore the initial queued snapshot from task creation.
      // It can be emitted before Feishu binding but delivered after binding due to async scheduling,
      // which would otherwise produce a stale early ACK ahead of the first real receive-stage update.
      if (task.status === 'queued' && latest?.type === 'created') {
        return;
      }

      if (!subscription.ackSent) {
        subscription.ackSent = true;
        subscription.lastProgressSent = task.progress;
        await this.sendAndTrack(task.id, {
          kind: 'task-ack',
          target: subscription.target,
          taskId: task.id,
          text: formatAckText(task, link),
          progress: task.progress,
          status: task.status,
          stage,
          detail: latest?.message,
          link,
        });
        return;
      }

      if (task.status === 'waiting') {
        subscription.lastEventType = 'waiting';
        await this.sendAndTrack(task.id, {
          kind: 'task-waiting',
          target: subscription.target,
          taskId: task.id,
          text: formatWaitingText(task, link),
          progress: task.progress,
          status: task.status,
          stage,
          detail: latest?.message,
          link,
          decision: task.decision,
        });
        return;
      }

      if (task.status === 'done') {
        subscription.lastEventType = 'done';
        await this.sendAndTrack(task.id, {
          kind: 'task-complete',
          target: subscription.target,
          taskId: task.id,
          text: formatCompleteText(task, link),
          progress: task.progress,
          status: task.status,
          stage,
          detail: latest?.message,
          link,
        });
        return;
      }

      if (task.status === 'failed') {
        subscription.lastEventType = 'failed';
        await this.sendAndTrack(task.id, {
          kind: 'task-failed',
          target: subscription.target,
          taskId: task.id,
          text: formatFailedText(task, link),
          progress: task.progress,
          status: task.status,
          stage,
          detail: latest?.message,
          link,
        });
        return;
      }

      const delta = task.progress - subscription.lastProgressSent;
      if (delta < this.config.progressThrottlePercent && latest?.type === 'log') {
        return;
      }

      subscription.lastProgressSent = task.progress;
      subscription.lastEventType = latest?.type;
      await this.sendAndTrack(task.id, {
        kind: 'task-progress',
        target: subscription.target,
        taskId: task.id,
        text: formatProgressText(task, link),
        progress: task.progress,
        status: task.status,
        stage,
        detail: latest?.message,
        link,
      });
    });
  }
}
