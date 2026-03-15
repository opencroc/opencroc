/**
 * LLM Provider Factory
 *
 * Creates the appropriate LLM provider based on config.
 */

import type { LlmProvider, LlmConfig } from '../types.js';
import { createOpenAIProvider } from './llm/openai-provider.js';
import { createZhipuProvider } from './llm/zhipu-provider.js';
import { createOllamaProvider } from './llm/ollama-provider.js';

export function createLlmProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAIProvider(config);
    case 'zhipu':
      return createZhipuProvider(config);
    case 'ollama':
      return createOllamaProvider(config);
    case 'custom':
      throw new Error('Custom LLM provider must be passed directly as a LlmProvider instance.');
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export { createOpenAIProvider } from './llm/openai-provider.js';
export { createZhipuProvider } from './llm/zhipu-provider.js';
export { createOllamaProvider } from './llm/ollama-provider.js';
