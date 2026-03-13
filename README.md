<p align="center">
  <img src="docs/assets/logo-placeholder.png" alt="OpenCroc" width="200" />
</p>

<h1 align="center">OpenCroc</h1>

<p align="center">
  <strong>AI-native E2E testing framework that reads your source code, generates tests, and self-heals failures.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencroc"><img src="https://img.shields.io/npm/v/opencroc?color=green" alt="npm version" /></a>
  <a href="https://github.com/opencroc/opencroc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/opencroc/opencroc" alt="MIT License" /></a>
  <a href="https://opencroc.com"><img src="https://img.shields.io/badge/docs-opencroc.com-blue" alt="Documentation" /></a>
</p>

---

## What is OpenCroc?

OpenCroc is an **AI-native end-to-end testing framework** built on top of [Playwright](https://playwright.dev). Instead of writing test scripts by hand, OpenCroc **reads your backend source code** (models, controllers, DTOs) and automatically generates complete E2E test suites — including API chains, seed data, request bodies, and assertions.

When tests fail, OpenCroc doesn't just report errors — it **traces the root cause** through the full request chain, **generates fix patches**, and **re-runs tests to verify the fix** — all autonomously.

### Key Capabilities

| Capability | Description |
|---|---|
| **Source-Aware Test Generation** | Parses Sequelize/TypeORM models, Express/NestJS controllers, and DTO decorators via [ts-morph](https://ts-morph.com) to understand your API surface |
| **AI-Driven Configuration** | LLM generates request body templates, seed data, parameter mappings — validated by 3-layer verification (schema → semantic → dry-run) |
| **Intelligent Chain Planning** | Builds API dependency DAGs, performs topological sorting, and plans test chains with greedy coverage optimization |
| **Log-Driven Completion Detection** | Goes beyond `networkidle` — verifies request completion by matching backend execution logs (`api_exec end`) |
| **Failure Chain Attribution** | Traces failures through the full call chain: network errors → slow APIs → backend logs → root cause |
| **Controlled Self-Healing** | `backup → AI patch → dry-run → apply → re-run → verify → rollback` — with safety gates at every step |
| **Impact Analysis** | BFS traversal of foreign key relations to map blast radius, auto-generates Mermaid diagrams |

## Quick Start

### Prerequisites

- Node.js >= 18
- A backend project with Express/NestJS + Sequelize/TypeORM

### Installation

```bash
npm install opencroc --save-dev
```

### Initialize

```bash
npx opencroc init
```

This will:
1. Scan your project structure
2. Detect your ORM and framework
3. Create `opencroc.config.ts` with sensible defaults
4. Generate a sample test suite

### Generate Tests

```bash
# Generate tests for a single module
npx opencroc generate --module=knowledge-base

# Generate tests for all detected modules
npx opencroc generate --all

# Dry-run (preview without writing files)
npx opencroc generate --all --dry-run
```

### Run Tests

```bash
# Run all generated tests
npx opencroc test

# Run specific module
npx opencroc test --module=knowledge-base

# Run with self-healing enabled
npx opencroc test --self-heal
```

### Validate AI Configs

```bash
# Validate generated configurations
npx opencroc validate --all

# Compare AI-generated vs baseline results
npx opencroc compare --baseline=report-a.json --current=report-b.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI / Orchestrator                       │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  Source   │  Chain   │  Test    │ Execution│   Self-Healing  │
│  Parser   │ Planner  │Generator │  Engine  │     Engine      │
│           │          │          │          │                 │
│ ts-morph  │ DAG +    │ Template │Playwright│ AI Attribution  │
│ Model     │ Topo     │ + AI     │ + Log    │ + Controlled    │
│ Controller│ Sort +   │ Config   │ Driven   │ Fix + Verify    │
│ DTO       │ Greedy   │ Merge    │ Assert   │ + Rollback      │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│              Observation Bus (Network + Backend Logs)         │
├──────────────────────────────────────────────────────────────┤
│              Report Engine (HTML / JSON / Markdown)           │
└──────────────────────────────────────────────────────────────┘
```

### 6-Stage Pipeline

```
Source Scan → ER Diagram → API Analysis → Chain Planning → Test Generation → Failure Analysis
     │            │             │              │                │                  │
  ts-morph    Mermaid      Dependency       Topological     Playwright +      Root Cause +
  parsing     erDiagram    DAG builder      + greedy        AI body/seed      Impact map
```

## How It Works

### 1. Source Parsing

OpenCroc uses [ts-morph](https://ts-morph.com) to statically analyze your backend:

- **Models**: Extracts table names, column types, indexes, and foreign keys from Sequelize `Model.init()` / TypeORM `@Entity()`
- **Controllers**: Extracts routes, HTTP methods, path parameters from Express `router.get/post/put/delete`
- **DTOs**: Extracts validation rules from `@IsString()`, `@IsNumber()`, `@IsOptional()` decorators

### 2. AI Configuration Generation

For each module, OpenCroc calls an LLM (OpenAI / ZhiPu / any OpenAI-compatible API) to generate:

- **Request body templates** — field-accurate POST/PUT payloads
- **Seed data** — `beforeAll` setup steps with correct API sequences
- **Parameter mappings** — path parameter aliases (`/:id` → `categoryId`)
- **ID aliases** — preventing ID conflicts across multi-resource chains

Each config is validated through **3 layers**:
1. **Schema validation** — JSON structure completeness
2. **Semantic validation** — field values match source code metadata
3. **Dry-run validation** — TypeScript compilation check

Failed configs are **automatically fixed** (up to 3 rounds) before being written.

### 3. Log-Driven Completion

Instead of relying on fragile `networkidle` signals:

```
Frontend Request → Backend api_exec start log → Backend processing → api_exec end log
                                                                          ↓
                                              OpenCroc polls end logs to confirm completion
```

This catches cases where the frontend appears idle but the backend is still processing.

### 4. Self-Healing Loop

```
Test Failure
  → AI Attribution (LLM + heuristic fallback)
  → Generate Fix Patch
  → Dry-Run Validation
  → Apply Patch (with backup)
  → Re-run Failed Tests
  → Verify Fix
  → Commit or Rollback
```

## Configuration

```typescript
// opencroc.config.ts
import { defineConfig } from 'opencroc';

export default defineConfig({
  // Backend source paths
  backend: {
    modelsDir: 'src/models',
    controllersDir: 'src/controllers',
    servicesDir: 'src/services',
  },

  // Target application
  baseUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000/api',

  // AI configuration
  ai: {
    provider: 'openai',        // 'openai' | 'zhipu' | 'custom'
    apiKey: process.env.AI_API_KEY,
    model: 'gpt-4o-mini',
  },

  // Test execution
  execution: {
    workers: 4,
    timeout: 30_000,
    retries: 1,
  },

  // Log-driven completion (requires backend instrumentation)
  logCompletion: {
    enabled: true,
    endpoint: '/internal/test-logs',
    pollIntervalMs: 500,
    timeoutMs: 10_000,
  },

  // Self-healing
  selfHealing: {
    enabled: false,
    fixScope: 'config-only',   // 'config-only' | 'config-and-source'
    maxFixRounds: 3,
    dryRunFirst: true,
  },
});
```

## Supported Tech Stacks

| Layer | Supported | Planned |
|---|---|---|
| **ORM** | Sequelize | TypeORM, Prisma, Drizzle |
| **Framework** | Express | NestJS, Fastify, Koa |
| **Test Runner** | Playwright | — |
| **LLM** | OpenAI, ZhiPu (GLM) | Anthropic, Ollama (local) |
| **Database** | MySQL, PostgreSQL | SQLite, MongoDB |

## Comparison

| Feature | OpenCroc | Playwright | Metersphere | auto-playwright |
|---|---|---|---|---|
| Source-aware generation | ✅ | ❌ | ❌ | ❌ |
| AI config generation + validation | ✅ | ❌ | ❌ | ❌ |
| Log-driven completion | ✅ | ❌ | ❌ | ❌ |
| Failure chain attribution | ✅ | ❌ | Partial | ❌ |
| Self-healing with rollback | ✅ | ❌ | ❌ | ❌ |
| API dependency DAG | ✅ | ❌ | ❌ | ❌ |
| Zero-config test generation | ✅ | Codegen only | Manual | NL→action |
| Impact blast radius analysis | ✅ | ❌ | ❌ | ❌ |

## Roadmap

- [x] 6-stage source-to-test pipeline
- [x] AI configuration generation with 3-layer validation
- [x] Controlled self-healing loop
- [x] Log-driven completion detection
- [x] Failure chain attribution + impact analysis
- [ ] TypeORM / Prisma adapter
- [ ] NestJS controller parser
- [ ] Visual dashboard (opencroc.com)
- [ ] GitHub Actions integration
- [ ] VS Code extension
- [ ] Ollama local LLM support

## Documentation

Visit **[opencroc.com](https://opencroc.com)** for full documentation, or browse:

- [Architecture Guide](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Backend Instrumentation Guide](docs/backend-instrumentation.md)
- [AI Provider Setup](docs/ai-providers.md)
- [Self-Healing Guide](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © 2026 OpenCroc Contributors
