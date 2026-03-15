/**
 * Ollama (Local) LLM Provider
 */

import type { LlmProvider, LlmConfig } from '../../types.js';

export function createOllamaProvider(config: LlmConfig): LlmProvider {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3.1';

  return {
    name: 'ollama',

    async chat(messages) {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${text}`);
      }

      const data = await response.json() as { message?: { content: string } };
      return data.message?.content || '';
    },

    estimateTokens(text) {
      return Math.ceil(text.length / 4);
    },
  };
}
