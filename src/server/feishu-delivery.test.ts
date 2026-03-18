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
  });

  it('fetches tenant token when app credentials are provided', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, msg: 'ok', tenant_access_token: 'tenant_token_fetched', expire: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, msg: 'ok', data: { message_id: 'om_002' } }),
      });
    global.fetch = fetchMock as typeof fetch;
    const delivery = new FeishuApiDelivery({ enabled: true, mode: 'live', appId: 'cli_xxx', appSecret: 'sec_xxx' });

    const receipt = await delivery.send(sampleMessage);

    expect(receipt).toEqual({ messageId: 'om_002', rootId: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/auth/v3/tenant_access_token/internal');
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('/im/v1/messages?receive_id_type=chat_id');
  });
});
