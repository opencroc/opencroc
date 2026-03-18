import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from './croc-office.js';
import { FeishuProgressBridge, type FeishuOutboundMessage } from './feishu-bridge.js';
import { registerFeishuSmokeRoutes } from './feishu-smoke.js';

function createApp(send: (message: FeishuOutboundMessage) => Promise<unknown>) {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: {} }, process.cwd());
  const feishuBridge = new FeishuProgressBridge({ send }, { baseTaskUrl: 'http://localhost:3333' });
  office.setFeishuBridge(feishuBridge);
  registerFeishuSmokeRoutes(app, office);
  return { app, office };
}

describe('registerFeishuSmokeRoutes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 502 when the initial Feishu ack cannot be delivered', async () => {
    const send = vi.fn(async (message: FeishuOutboundMessage) => {
      throw new Error(`delivery failed for ${message.kind}`);
    });
    const { app, office } = createApp(send);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/smoke/progress',
      payload: {
        chatId: 'oc_smoke_1',
        requestId: 'om_smoke_1',
        title: 'Smoke test',
      },
    });

    expect(res.statusCode).toBe(502);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');

    const payload = res.json();
    expect(payload).toMatchObject({
      ok: false,
      error: 'Failed to send initial Feishu ACK',
      detail: 'delivery failed for task-ack',
    });

    const task = office.getTask(payload.taskId);
    expect(task?.status).toBe('failed');
    expect(task?.currentStageKey).toBe('receive');
    expect(task?.events.at(-1)?.message).toContain('Failed to send initial Feishu ACK');
  });

  it('marks each smoke stage as done in order before completion', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: `om_${send.mock.calls.length + 1}` }));
    const { app, office } = createApp(send);

    const resPromise = app.inject({
      method: 'POST',
      url: '/api/feishu/smoke/progress',
      payload: {
        chatId: 'oc_smoke_2',
        requestId: 'om_smoke_2',
        title: 'Smoke success',
      },
    });

    await vi.runAllTimersAsync();
    const res = await resPromise;

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    await vi.advanceTimersByTimeAsync(6_500);

    const task = office.getTask(payload.taskId);
    expect(task?.status).toBe('done');
    expect(task?.currentStageKey).toBe('finalize');
    expect(task?.stages.map((stage) => [stage.key, stage.status])).toEqual([
      ['receive', 'done'],
      ['understand', 'done'],
      ['gather', 'done'],
      ['generate', 'done'],
      ['finalize', 'done'],
    ]);
    expect(send).toHaveBeenCalledTimes(6);
  });
});
