import type { CrocOffice } from './croc-office.js';
import type { FeishuProgressBridge } from './feishu-bridge.js';
import { classifyChatTaskIntent, dispatchChatTask } from './chat-task-dispatcher.js';

export interface ComplexRequestStartResult {
  kind: 'task-start';
  taskId: string;
  ack: ReturnType<FeishuProgressBridge['createRequestAck']>;
  dispatch: {
    intent: 'pipeline' | 'scan' | 'report' | 'analysis';
    action: 'started';
    reason: string;
  };
  suggestedExecution: {
    type: 'chat-task';
    nextStage: 'understand' | 'gather';
    suggestedActions: string[];
  };
}

export interface FeishuComplexTaskStartParams {
  text: string;
  chatId: string;
  threadId?: string;
  requestId?: string;
  replyToMessageId?: string;
  rootMessageId?: string;
  receiveDetail?: string;
  understandDetail?: string;
}

export type FeishuComplexTaskStartOutcome =
  | {
      ok: true;
      result: ComplexRequestStartResult;
    }
  | {
      ok: false;
      taskId: string;
      error: 'Failed to send initial Feishu ACK';
      detail: string;
    };

export function previewDispatch(text: string): ComplexRequestStartResult['dispatch'] {
  const plan = classifyChatTaskIntent(text);
  return {
    intent: plan.intent,
    action: 'started',
    reason: plan.reason,
  };
}

export function isComplexRequest(text: string): boolean {
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

export async function startComplexFeishuChatTask(
  office: CrocOffice,
  feishuBridge: FeishuProgressBridge,
  params: FeishuComplexTaskStartParams,
): Promise<FeishuComplexTaskStartOutcome> {
  const task = office.createChatTask(buildTitle(params.text));
  office.bindTaskToFeishu(task.id, {
    chatId: params.chatId,
    threadId: params.threadId,
    requestId: params.requestId,
    replyToMessageId: params.replyToMessageId,
    rootMessageId: params.rootMessageId,
    source: 'feishu',
  });

  office.activateTask(task.id);
  try {
    await office.markTaskRunningAndWait('receive', params.receiveDetail || 'Task accepted from Feishu', 8);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    office.unbindTaskFromFeishu(task.id);
    office.failTask(`Failed to send initial Feishu ACK: ${detail}`);
    office.activateTask(null);
    return {
      ok: false,
      taskId: task.id,
      error: 'Failed to send initial Feishu ACK',
      detail,
    };
  }

  office.markTaskRunning('understand', params.understandDetail || 'Understanding request context', 15);
  office.activateTask(null);

  const ack = feishuBridge.createRequestAck(task.id, {
    title: task.title,
    target: {
      chatId: params.chatId,
      threadId: params.threadId,
      requestId: params.requestId,
      replyToMessageId: params.replyToMessageId,
      rootMessageId: params.rootMessageId,
      source: 'feishu',
    },
    kind: 'chat',
    initialProgress: 15,
    stage: '理解问题',
    detail: '已收到复杂请求，正在进入任务执行态',
  });

  const dispatch = previewDispatch(params.text);

  void dispatchChatTask(office, task.id, params.text).catch((error) => {
    office.activateTask(task.id);
    office.failTask(error instanceof Error ? error.message : String(error));
    office.activateTask(null);
  });

  return {
    ok: true,
    result: {
      kind: 'task-start',
      taskId: task.id,
      ack,
      dispatch: {
        intent: dispatch.intent,
        action: dispatch.action,
        reason: dispatch.reason,
      },
      suggestedExecution: {
        type: 'chat-task',
        nextStage: 'understand',
        suggestedActions: dispatch.intent === 'analysis'
          ? ['run-chat-analysis', 'stream-progress-back-to-feishu']
          : ['run-linked-task-flow', 'stream-progress-back-to-feishu'],
      },
    },
  };
}
