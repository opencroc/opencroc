# Configuration

OpenCroc uses a `opencroc.config.ts` file in your project root.

## Quick Start

```bash
npx opencroc init
```

This creates a default `opencroc.config.ts`:

```typescript
import { defineConfig } from 'opencroc';

export default defineConfig({
  backendRoot: './backend',
  adapter: 'sequelize',
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
  },
  selfHealing: {
    enabled: true,
    maxIterations: 3,
  },
});
```

## Full Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `backendRoot` | `string` | (required) | Path to backend source code |
| `outDir` | `string` | `./opencroc-output` | Output directory for generated files |
| `adapter` | `string \| BackendAdapter` | `'sequelize'` | ORM adapter |
| `llm` | `LlmConfig` | — | LLM provider settings |
| `playwright` | `PlaywrightOverrides` | — | Playwright overrides |
| `modules` | `string[]` | all | Filter to specific modules |
| `steps` | `PipelineStep[]` | all | Run specific pipeline steps |
| `selfHealing` | `SelfHealingConfig` | `{ enabled: true }` | Self-healing settings |
| `report` | `ReportConfig` | `{ format: ['html'] }` | Report output settings |

## LLM Configuration

```typescript
llm: {
  provider: 'openai',      // 'openai' | 'zhipu' | 'ollama' | 'custom'
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  maxTokens: 4096,
  temperature: 0.1,
}
```

### Environment Variables

Instead of hardcoding API keys, use environment variables:

```bash
# .env
OPENCROC_LLM_API_KEY=sk-...
OPENCROC_LLM_MODEL=gpt-4o-mini
```

## Pipeline Steps

You can run specific steps with the `steps` option or the `--steps` CLI flag:

- `scan` — Discover modules
- `er-diagram` — Generate ER diagrams
- `api-chain` — Analyze API dependencies
- `plan` — Plan test chains
- `codegen` — Generate test files
- `validate` — Validate output

```bash
npx opencroc generate --steps scan,er-diagram,api-chain
```

## Custom Adapters

```typescript
import { defineConfig, type BackendAdapter } from 'opencroc';

const myAdapter: BackendAdapter = {
  name: 'my-orm',
  async parseModels(dir) { /* ... */ },
  async parseAssociations(file) { /* ... */ },
  async parseControllers(dir) { /* ... */ },
};

export default defineConfig({
  backendRoot: './src',
  adapter: myAdapter,
});
```
