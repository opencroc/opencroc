import type { FeishuBridgeConfig, FeishuBridgeDelivery, FeishuDeliveryReceipt, FeishuOutboundMessage } from './feishu-bridge.js';

interface TokenCache {
  value: string;
  expiresAt: number;
}

interface FeishuTenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuSendMessageResponse {
  code: number;
  msg: string;
  data?: {
    message_id?: string;
    root_id?: string;
  };
}

function resolveApiBaseUrl(config: FeishuBridgeConfig): string {
  return (config.apiBaseUrl || 'https://open.feishu.cn/open-apis').replace(/\/$/, '');
}

function formatOutboundText(message: FeishuOutboundMessage): string {
  return message.text;
}

export class FeishuApiDelivery implements FeishuBridgeDelivery {
  private readonly config: FeishuBridgeConfig;
  private tokenCache: TokenCache | null = null;

  constructor(config: FeishuBridgeConfig) {
    this.config = config;
  }

  private isLive(): boolean {
    return this.config.enabled !== false && this.config.mode === 'live';
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.config.tenantAccessToken) return this.config.tenantAccessToken;
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.value;
    }
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('Feishu live delivery requires tenantAccessToken or appId/appSecret');
    }

    const response = await fetch(`${resolveApiBaseUrl(this.config)}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Feishu tenant access token: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as FeishuTenantAccessTokenResponse;
    if (json.code !== 0 || !json.tenant_access_token) {
      throw new Error(`Feishu token API error: ${json.msg || json.code}`);
    }

    this.tokenCache = {
      value: json.tenant_access_token,
      expiresAt: Date.now() + Math.max((json.expire ?? 7200) - 60, 60) * 1000,
    };

    return json.tenant_access_token;
  }

  async send(message: FeishuOutboundMessage): Promise<FeishuDeliveryReceipt | void> {
    if (!this.isLive()) {
      return;
    }

    if (!message.target.chatId) {
      throw new Error('Feishu outbound message missing chatId');
    }

    const token = await this.getTenantAccessToken();
    const response = await fetch(`${resolveApiBaseUrl(this.config)}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: message.target.chatId,
        msg_type: 'text',
        content: JSON.stringify({
          text: formatOutboundText(message),
        }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Feishu message: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as FeishuSendMessageResponse;
    if (json.code !== 0) {
      throw new Error(`Feishu send message error: ${json.msg || json.code}`);
    }

    return {
      messageId: json.data?.message_id,
      rootId: json.data?.root_id,
    };
  }
}
