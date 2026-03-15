/**
 * OpenAI LLM Provider
 */

import type { LlmProvider, LlmConfig } from '../../types.js';

export function createOpenAIProvider(config: LlmConfig): LlmProvider {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const model = config.model || 'gpt-4o-mini';

  return {
    name: 'openai',

    async chat(messages) {
      const apiKey = config.apiKey || process.env.OPENCROC_LLM_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI API key is required. Set llm.apiKey or OPENAI_API_KEY env var.');

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
        throw new Error(`OpenAI API error ${response.status}: ${text}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || '';
    },

    estimateTokens(text) {
      // Rough approximation: ~4 chars per token for English, ~2 for CJK
      return Math.ceil(text.length / 3);
    },
  };
}
