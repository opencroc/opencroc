/**
 * Zhipu (智谱) LLM Provider
 */

import type { LlmProvider, LlmConfig } from '../../types.js';

export function createZhipuProvider(config: LlmConfig): LlmProvider {
  const baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
  const model = config.model || 'glm-4-flash';

  return {
    name: 'zhipu',

    async chat(messages) {
      const apiKey = config.apiKey || process.env.OPENCROC_LLM_API_KEY || process.env.ZHIPU_API_KEY;
      if (!apiKey) throw new Error('Zhipu API key is required. Set llm.apiKey or ZHIPU_API_KEY env var.');

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature ?? 0.1,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Zhipu API error ${response.status}: ${text}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || '';
    },

    estimateTokens(text) {
      // CJK-heavy: ~2 chars per token
      return Math.ceil(text.length / 2);
    },
  };
}
