import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from './croc-office.js';
import { FeishuProgressBridge } from './feishu-bridge.js';
import { registerFeishuIngressRoutes } from './feishu-ingress.js';

function createApp() {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: {} }, process.cwd());
  const feishuBridge = new FeishuProgressBridge({ send: async () => {} }, { baseTaskUrl: 'http://localhost:3333' });
  office.setFeishuBridge(feishuBridge);
  registerFeishuIngressRoutes(app, office, feishuBridge);
  return { app, office };
}

describe('registerFeishuIngressRoutes', () => {
  it('responds to Feishu url verification challenge', async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: { type: 'url_verification', challenge: 'hello-challenge' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ challenge: 'hello-challenge' });
  });

  it('creates a chat task and returns ack payload for complex Feishu message', async () => {
    const { app, office } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1' },
        event: {
          sender: { sender_id: { open_id: 'ou_xxx' } },
          message: {
            message_id: 'om_123',
            chat_id: 'oc_456',
            message_type: 'text',
            content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.result.kind).toBe('task-start');
    expect(payload.result.taskId).toBeTruthy();
    expect(payload.result.ack.message.text).toContain('taskId');

    const task = office.getTask(payload.result.taskId);
    expect(task?.kind).toBe('chat');
    expect(task?.status).toBe('running');
    expect(task?.currentStageKey).toBe('understand');
  });

  it('passes through simple short messages', async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_id: 'om_short',
            chat_id: 'oc_456',
            message_type: 'text',
            content: JSON.stringify({ text: '你好' }),
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.result.kind).toBe('pass-through');
  });
});
