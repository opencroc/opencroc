<p align="center">
  <img src="assets/banner.png" alt="OpenCroc banner" width="820" />
</p>

<h1 align="center">OpenCroc</h1>

<p align="center">
  <strong>AI-native project intelligence platform that turns codebases into living knowledge graphs, executable tasks, and agent workspaces.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencroc"><img src="https://img.shields.io/npm/v/opencroc?color=green" alt="npm version" /></a>
  <a href="https://github.com/opencroc/opencroc/actions/workflows/ci.yml"><img src="https://github.com/opencroc/opencroc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/opencroc/opencroc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/opencroc/opencroc" alt="MIT License" /></a>
  <a href="https://opencroc.com"><img src="https://img.shields.io/badge/docs-opencroc.com-blue" alt="Documentation" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">Simplified Chinese</a> | <a href="README.ja.md">Japanese</a>
</p>

---

## What is OpenCroc?

OpenCroc is an AI-native project intelligence platform. It ingests codebases, turns them into living knowledge graphs, surfaces risks, coordinates specialized agents, and can drive execution loops such as scanning, planning, testing, healing, and reporting.

The current product still includes its source-aware E2E testing engine built on top of [Playwright](https://playwright.dev), but the direction is broader: repo understanding, task orchestration, visual workspaces, and agent-assisted execution. Instead of treating software projects as static folders, OpenCroc treats them as active systems that can be mapped, monitored, and improved.

## Key Capabilities

| Capability | Description |
| --- | --- |
| Source-aware generation | Parses Sequelize, TypeORM, Prisma, and Drizzle structures to understand modules, models, routes, and DTOs |
| AI-driven config generation | Produces request templates, seed plans, parameter mappings, and test scaffolds with validation gates |
| Chain planning | Builds dependency DAGs and plans execution order for higher API coverage |
| Log-driven completion | Uses backend execution signals instead of relying only on `networkidle` |
| Failure attribution | Traces issues across frontend requests, backend logs, and dependency chains |
| Controlled self-healing | Supports backup, patch, dry-run, re-run, verify, and rollback loops |
| Visual Studio | Ships a local web UI for graph exploration, agent activity, and pixel-office monitoring |

## Quick Start

### Prerequisites

- Node.js 18 or newer
- A backend project using Express or NestJS
- One of the supported ORM or schema patterns

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
2. Detect your framework and ORM patterns
3. Create `opencroc.config.ts`
4. Generate a starter output layout

### Generate Tests

```bash
# Generate tests for a single module
npx opencroc generate --module=knowledge-base

# Generate tests for all detected modules
npx opencroc generate --all

# Preview without writing files
npx opencroc generate --all --dry-run
```

### Run Tests

```bash
# Run all generated tests
npx opencroc test

# Run a single module
npx opencroc test --module=knowledge-base

# Run in headed mode
npx opencroc test --headed

# Override hooks from the CLI
npx opencroc test --setup-hook="npm run e2e:setup" --auth-hook="node scripts/auth.js" --teardown-hook="npm run e2e:cleanup"
```

### Validate AI Configs

```bash
npx opencroc validate --all
npx opencroc compare --baseline=report-a.json --current=report-b.json
```

## OpenCroc Studio

OpenCroc Studio is the local visual workspace for OpenCroc. It combines a knowledge graph view, a pixel-office operations view, and a 3D office runtime into one web experience served by the CLI.

### Launch Studio

```bash
# Start Studio and open the browser
npx opencroc serve

# Custom port
npx opencroc serve --port 3000

# Disable browser auto-open
npx opencroc serve --no-open

# Bind a public host
npx opencroc serve --host 0.0.0.0 --port 8765
```

### Current Web Architecture

- Fastify serves the local Studio application and API endpoints
- The frontend is a single-entry Vite SPA
- The main routes are `/`, `/studio`, and `/pixel`
- The web source is organized under `src/web` with `app`, `pages`, `features`, `shared`, `styles`, and `public`
- Legacy entry URLs such as `/index-studio.html` and `/index-v2-pixel.html` are redirected to SPA routes

### Feishu Progress Bridge (MVP)

OpenCroc now includes an MVP Feishu progress bridge for complex tasks.

Minimal config example:

```ts
import { defineConfig } from 'opencroc';

export default defineConfig({
  backendRoot: './backend',
  feishu: {
    enabled: true,
    mode: 'live',
    messageFormat: 'text',
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    baseTaskUrl: 'http://127.0.0.1:8765',
    progressThrottlePercent: 15,
  },
});
```

Current endpoints:

- `POST /api/feishu/webhook` — receive Feishu events and create chat tasks for complex messages
- `POST /api/feishu/smoke/progress` — start a smoke task that pushes staged progress updates back to Feishu
- `POST /api/feishu/tasks/:id/waiting` — move a task into waiting/decision state

Quick smoke test:

```bash
curl -X POST http://127.0.0.1:8765/api/feishu/smoke/progress \
  -H 'content-type: application/json' \
  -d '{
    "chatId": "oc_xxx",
    "requestId": "om_xxx",
    "title": "Smoke test from local OpenCroc"
  }'
```

If Feishu live delivery is configured correctly, you should receive:

1. an immediate ACK / task start message
2. several staged progress updates
3. a final completion message

### Studio Features

- Knowledge graph canvas for modules, APIs, and relations
- Pixel-office dashboard for live agent activity
- 3D office runtime view for immersive monitoring
- Real-time updates over WebSocket
- Sidebar navigation and route-based view switching
- REST endpoints such as `GET /api/project`, `GET /api/agents`, and `POST /api/project/refresh`

## Full Pipeline

```bash
# Run the full pipeline
npx opencroc run

# Run a module with self-healing and reports
npx opencroc run --module=users --self-heal --report html,json
```

## CI/CD Integration

```bash
npx opencroc ci --platform github
npx opencroc ci --platform gitlab --self-heal
```

## Dashboard and Reports

```bash
npx opencroc dashboard
npx opencroc report --format html,json,markdown
```

## Architecture

```text
+-------------------------------------------------------------------+
| OpenCroc Studio                                                   |
| Fastify server + single-entry Vite SPA + WebSocket updates        |
| Routes: /, /studio, /pixel                                        |
+-------------------------------------------------------------------+
| CLI / Orchestrator                                                |
+--------------+--------------+---------------+----------------------+
| Source Parse | Chain Plan   | Test Generate | Execute / Observe    |
+--------------+--------------+---------------+----------------------+
| Self-Heal    | Impact Map   | Reports       | Dashboard / Studio   |
+--------------+--------------+---------------+----------------------+
```

### 6-Stage Pipeline

```text
Source Scan -> ER Diagram -> API Analysis -> Chain Planning -> Test Generation -> Failure Analysis
```

## How It Works

### 1. Source Parsing

OpenCroc uses [ts-morph](https://ts-morph.com) and framework-aware parsers to analyze:

- Models and relations
- Controllers and routes
- DTO fields and validation rules
- Module boundaries and dependency surfaces

### 2. AI Configuration Generation

For each module, OpenCroc can generate:

- Request body templates
- Seed data plans
- Parameter mappings
- ID alias rules

Each config passes through validation stages:

1. Schema validation
2. Semantic validation
3. Dry-run validation

### 3. Log-Driven Completion

Instead of depending only on browser idle heuristics, OpenCroc can watch backend completion signals and correlate them with frontend actions.

### 4. Self-Healing Loop

```text
Test Failure
-> Attribution
-> Proposed Fix
-> Dry-Run Validation
-> Apply Patch
-> Re-run
-> Verify
-> Rollback if needed
```

## Real-World Validation

OpenCroc has been exercised against a production-style RBAC system with more than 100 Sequelize models, dozens of controllers, and embedded associations.

```bash
$ npx tsx examples/rbac-system/smoke-test.ts

Modules        : 5
ER Diagrams    : 5
Chain Plans    : 5
Generated Files: 78
Duration       : 1153ms
```

Key findings:

- 102 tables and 65 foreign-key relations extracted from a flat model layout
- Embedded associations detected without requiring dedicated association files
- 78 generated test files across 5 modules
- Support for both flat and nested directory layouts

## Configuration

```typescript
import { defineConfig } from 'opencroc';

export default defineConfig({
  backend: {
    modelsDir: 'src/models',
    controllersDir: 'src/controllers',
    servicesDir: 'src/services',
  },

  baseUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000/api',

  ai: {
    provider: 'openai',
    apiKey: process.env.AI_API_KEY,
    model: 'gpt-4o-mini',
  },

  execution: {
    workers: 4,
    timeout: 30_000,
    retries: 1,
  },

  logCompletion: {
    enabled: true,
    endpoint: '/internal/test-logs',
    pollIntervalMs: 500,
    timeoutMs: 10_000,
  },

  selfHealing: {
    enabled: false,
    fixScope: 'config-only',
    maxFixRounds: 3,
    dryRunFirst: true,
  },
});
```

## Supported Tech Stacks

| Layer | Supported | Planned |
| --- | --- | --- |
| ORM | Sequelize, TypeORM, Prisma, Drizzle | More adapters as needed |
| Framework | Express | NestJS, Fastify, Koa |
| Test Runner | Playwright | Additional runners |
| LLM | OpenAI, ZhiPu, Ollama | Anthropic |
| Database | MySQL, PostgreSQL | SQLite, MongoDB |

## Comparison

| Feature | OpenCroc | Playwright | Metersphere | auto-playwright |
| --- | --- | --- | --- | --- |
| Source-aware generation | Yes | No | No | No |
| AI config generation and validation | Yes | No | No | No |
| Log-driven completion | Yes | No | No | No |
| Failure attribution | Yes | No | Partial | No |
| Self-healing with rollback | Yes | No | No | No |
| API dependency DAG | Yes | No | No | No |
| Zero-config test generation | Yes | Limited | Manual | Prompt-driven |
| Impact analysis | Yes | No | No | No |

## Roadmap

- [x] 6-stage source-to-test pipeline
- [x] AI configuration generation with validation
- [x] Controlled self-healing loop
- [x] Log-driven completion detection
- [x] Failure attribution and impact analysis
- [x] Prisma and Drizzle adapters
- [x] Ollama local LLM support
- [x] CI integration
- [x] VS Code extension scaffold
- [x] Plugin system
- [x] HTML, JSON, and Markdown reports
- [x] Visual Studio dashboard
- [x] Runtime infrastructure
- [x] Full orchestration pipeline
- [x] Advanced reporters
- [x] OpenCroc Studio route-based web app

## Release Snapshot

- Product snapshot covered by this README: `1.8.3`
- Studio architecture snapshot: Fastify + single-entry Vite SPA + route-based views
- Main Studio routes: `/`, `/studio`, `/pixel`
- Full-suite quality gate: 41 test files and 414 tests passing

### Version Rhythm

- `0.3.x`: plugin system, CI templates, reporters, VS Code scaffold
- `0.4.x`: NestJS controller parser
- `0.5.x`: Drizzle ORM adapter
- `0.6.x`: visual dashboard and Windows Vitest stability work
- `0.7.x - 0.9.x`: runtime infrastructure, auth, log-driven detection, rules engine
- `1.0.0`: full orchestration pipeline
- `1.1.0`: advanced self-healing
- `1.2.0`: advanced reporters and migration work
- `1.3.0`: OpenCroc Studio M1
- `1.8.3`: Vite SPA routing, web architecture cleanup, package slimming

### Release Verification

```bash
npm run lint
npm run typecheck
npm test
npm view opencroc version dist-tags --json
```

## Documentation

Visit **[opencroc.com](https://opencroc.com)** for documentation, or browse:

- [Architecture Guide](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Backend Instrumentation Guide](docs/backend-instrumentation.md)
- [AI Provider Setup](docs/ai-providers.md)
- [Self-Healing Guide](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) Copyright 2026 OpenCroc Contributors
