# AI Providers

OpenCroc supports multiple LLM providers for failure attribution, config suggestion, and self-healing.

## Built-in Providers

### OpenAI

```typescript
llm: {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',  // recommended for cost efficiency
}
```

Supported models: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`

### Zhipu (智谱)

```typescript
llm: {
  provider: 'zhipu',
  apiKey: process.env.ZHIPU_API_KEY,
  model: 'glm-4-flash',
}
```

### Ollama (Local)

```typescript
llm: {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.1',
}
```

No API key required. Make sure Ollama is running locally.

## Custom Provider

Implement the `LlmProvider` interface:

```typescript
import { defineConfig, type LlmProvider } from 'opencroc';

const myProvider: LlmProvider = {
  name: 'my-llm',
  async chat(messages) {
    const response = await fetch('https://my-api.example.com/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const data = await response.json();
    return data.content;
  },
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  },
};

export default defineConfig({
  backendRoot: './backend',
  llm: { provider: 'custom' },
  // Pass custom provider via programmatic API
});
```

## Token Budget

OpenCroc tracks token usage across all LLM calls and enforces budgets:

- Default budget: 100,000 tokens per pipeline run
- Configurable via `llm.maxTokens`
- Detailed token usage reports in `opencroc-output/token-usage.json`
