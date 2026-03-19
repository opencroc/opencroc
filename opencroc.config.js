import { defineConfig } from './dist/index.js';

export default defineConfig({
  backendRoot: '.',
  feishu: {
    enabled: true,
    mode: 'live',
    messageFormat: 'text',
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    tenantAccessToken: process.env.FEISHU_TENANT_ACCESS_TOKEN,
    baseTaskUrl: process.env.OPENCROC_BASE_TASK_URL ?? 'http://127.0.0.1:8765',
    progressThrottlePercent: 10,
  },
});
