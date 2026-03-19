import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FeishuApiDelivery } from './feishu-delivery.js';
import type { FeishuOutboundMessage } from './feishu-bridge.js';

const sampleMessage: FeishuOutboundMessage = {
  kind: 'task-progress',
  target: { chatId: 'oc_123', source: 'feishu' },
  taskId: 'task_123',
  text: '任务进度更新：OpenCroc roadmap 分析',
  progress: 42,
  status: 'running',
};

describe('FeishuApiDelivery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does nothing in mock mode', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'mock' });

    await delivery.send(sampleMessage);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends text messages in live mode with fixed tenant token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, msg: 'ok', data: { message_id: 'om_001' } }),
    }));
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'live', tenantAccessToken: 'tenant_token_xxx' });

    const receipt = await delivery.send(sampleMessage);

    expect(receipt).toEqual({ messageId: 'om_001', rootId: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/im/v1/messages?receive_id_type=chat_id');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tenant_token_xxx');
    expect(String(init.body)).toContain('任务进度更新');
    expect(String(init.body)).toContain('"reply_in_thread":false');
  });

  it('switches to open_id delivery for direct-message user targets', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, msg: 'ok', data: { message_id: 'om_dm_1' } }),
    }));
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'live', tenantAccessToken: 'tenant_token_xxx' });

    const receipt = await delivery.send({
      ...sampleMessage,
      target: { chatId: 'ou_123456', source: 'feishu' },
    });

    expect(receipt).toEqual({ messageId: 'om_dm_1', rootId: undefined, threadId: undefined });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/im/v1/messages?receive_id_type=open_id');
    expect(String(init.body)).toContain('"receive_id":"ou_123456"');
  });

  it('sends interactive card messages when card payload exists', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, msg: 'ok', data: { message_id: 'om_card_1', root_id: 'om_root_card' } }),
    }));
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'live', tenantAccessToken: 'tenant_token_xxx' });

    const receipt = await delivery.send({
      ...sampleMessage,
      kind: 'task-ack',
      card: {
        schema: '2.0',
        header: {
          title: { tag: 'plain_text', content: '任务已开始：task_123' },
          template: 'blue',
        },
        elements: [],
      },
    });

    expect(receipt).toEqual({ messageId: 'om_card_1', rootId: 'om_root_card', threadId: undefined });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('"msg_type":"interactive"');
    expect(String(init.body)).toContain('任务已开始：task_123');
  });

  it('fetches tenant token when app credentials are provided', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, msg: 'ok', tenant_access_token: 'tenant_token_fetched', expire: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, msg: 'ok', data: { message_id: 'om_002', root_id: 'om_root_1', thread_id: 'omt_1' } }),
      });
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'live', appId: 'cli_xxx', appSecret: 'sec_xxx' });

    const receipt = await delivery.send({
      ...sampleMessage,
      target: { chatId: 'oc_123', source: 'feishu', rootMessageId: 'om_root_1', replyToMessageId: 'om_ack_1' },
    });

    expect(receipt).toEqual({ messageId: 'om_002', rootId: 'om_root_1', threadId: 'omt_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/auth/v3/tenant_access_token/internal');
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('/im/v1/messages?receive_id_type=chat_id');
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(String(secondInit.body)).toContain('"reply_in_thread":true');
    expect(String(secondInit.body)).toContain('"root_id":"om_root_1"');
    expect(String(secondInit.body)).toContain('"reply_to_message_id":"om_ack_1"');
  });
});
