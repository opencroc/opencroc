<p align="center">
  <img src="assets/banner.png" alt="OpenCroc 横幅" width="820" />
</p>

<h1 align="center">OpenCroc</h1>

<p align="center">
  <strong>AI 原生 E2E 测试框架：读取你的源码、自动生成测试、并可自愈失败。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencroc"><img src="https://img.shields.io/npm/v/opencroc?color=green" alt="npm version" /></a>
  <a href="https://github.com/opencroc/opencroc/actions/workflows/ci.yml"><img src="https://github.com/opencroc/opencroc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/opencroc/opencroc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/opencroc/opencroc" alt="MIT License" /></a>
  <a href="https://opencroc.com"><img src="https://img.shields.io/badge/docs-opencroc.com-blue" alt="Documentation" /></a>
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.ja.md">日本語</a>
</p>

---

## OpenCroc 是什么？

OpenCroc 是一个构建在 [Playwright](https://playwright.dev) 之上的 **AI 原生端到端测试框架**。你不需要手写大量脚本，OpenCroc 会**读取后端源码**（模型、控制器、DTO），并自动生成完整 E2E 测试套件，包括 API 调用链、种子数据、请求体与断言。

当测试失败时，OpenCroc 不只是报错，而是会沿完整请求链路**定位根因**、**生成修复补丁**，并**自动回归验证**修复结果。

### 核心能力

| 能力 | 说明 |
|---|---|
| **源码感知测试生成** | 通过 [ts-morph](https://ts-morph.com) 解析 Sequelize/TypeORM 模型、Express/NestJS 控制器、DTO 装饰器，识别 API 面 |
| **AI 配置生成** | 使用 LLM 生成请求模板、种子数据、参数映射，并通过三层校验（schema -> semantic -> dry-run） |
| **智能调用链规划** | 构建 API 依赖 DAG，做拓扑排序并以贪心策略提升覆盖率 |
| **日志驱动完成判定** | 超越 `networkidle`，通过后端日志（`api_exec end`）确认请求真正完成 |
| **失败链路归因** | 从网络异常 -> 慢接口 -> 后端日志逐层追踪，定位根因 |
| **可控自愈机制** | `backup -> AI patch -> dry-run -> apply -> re-run -> verify -> rollback`，每步有安全闸门 |
| **影响面分析** | 基于外键关系做 BFS 传播分析，自动输出 Mermaid 图 |

## 快速开始

### 前置要求

- Node.js >= 18
- 使用 Express/NestJS + Sequelize/TypeORM 的后端项目

### 安装

```bash
npm install opencroc --save-dev
```

### 初始化

```bash
npx opencroc init
```

该命令会：
1. 扫描项目结构
2. 识别 ORM 与后端框架
3. 生成默认 `opencroc.config.ts`
4. 生成一套示例测试

### 生成测试

```bash
# 为单个模块生成测试
npx opencroc generate --module=knowledge-base

# 为所有模块生成测试
npx opencroc generate --all

# 仅预览，不落盘
npx opencroc generate --all --dry-run
```

### 运行测试

```bash
# 运行全部生成的测试
npx opencroc test

# 运行指定模块
npx opencroc test --module=knowledge-base

# 启用自愈运行
npx opencroc test --self-heal
```

### 校验 AI 配置

```bash
# 校验所有生成配置
npx opencroc validate --all

# 比较两份报告差异
npx opencroc compare --baseline=report-a.json --current=report-b.json
```

## 架构

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

### 6 阶段流水线

```
Source Scan -> ER Diagram -> API Analysis -> Chain Planning -> Test Generation -> Failure Analysis
     │            │             │              │                │                  │
  ts-morph    Mermaid      Dependency       Topological     Playwright +      Root Cause +
  parsing     erDiagram    DAG builder      + greedy        AI body/seed      Impact map
```

## 工作原理

### 1. 源码解析

OpenCroc 基于 [ts-morph](https://ts-morph.com) 做静态分析：

- **Models**：从 Sequelize `Model.init()` / TypeORM `@Entity()` 提取表名、字段类型、索引、外键
- **Controllers**：从 Express `router.get/post/put/delete` 提取路由、HTTP 方法、路径参数
- **DTOs**：从 `@IsString()`、`@IsNumber()`、`@IsOptional()` 装饰器提取校验规则

### 2. AI 配置生成

每个模块都会调用 LLM（OpenAI / 智谱 / 任意 OpenAI 兼容 API）生成：

- **请求体模板**：字段级精确的 POST/PUT payload
- **种子数据**：`beforeAll` 的初始化步骤与正确调用顺序
- **参数映射**：路径参数别名（`/:id` -> `categoryId`）
- **ID 别名**：避免多资源链路中的 ID 冲突

每份配置都要通过 **3 层校验**：
1. **Schema 校验**：JSON 结构完整性
2. **语义校验**：字段值是否与源码元数据一致
3. **Dry-run 校验**：TypeScript 编译检查

若校验失败，会在落盘前自动修复（最多 3 轮）。

### 3. 日志驱动完成判定

不依赖脆弱的 `networkidle`：

```
Frontend Request -> Backend api_exec start log -> Backend processing -> api_exec end log
                                                                          ↓
                                              OpenCroc polls end logs to confirm completion
```

这能覆盖“前端看起来空闲、后端仍在处理”的场景。

### 4. 自愈闭环

```
Test Failure
  -> AI Attribution (LLM + heuristic fallback)
  -> Generate Fix Patch
  -> Dry-Run Validation
  -> Apply Patch (with backup)
  -> Re-run Failed Tests
  -> Verify Fix
  -> Commit or Rollback
```

## 真实项目验证

OpenCroc 已在一套**生产级 RBAC 系统**（多租户企业权限管理）上完成验证，涵盖 100+ Sequelize 模型、75+ Express 控制器、以及模型文件内嵌的关联声明：

```
$ npx tsx examples/rbac-system/smoke-test.ts

Modules        : 5 (default, aigc, data-platform, integration, workflow)
ER Diagrams    : 5
  [default] 102 tables, 65 relations
  [aigc] 6 tables, 0 relations
  [data-platform] 4 tables, 0 relations
  [integration] 14 tables, 0 relations
  [workflow] 2 tables, 0 relations
Chain Plans    : 5
  [aigc] 78 chains, 150 steps
Generated Files: 78
Duration       : 1153ms
```

关键发现：
- 从扁平模型布局中正确提取了 **102 张表** 和 **65 条外键关系**
- 无需独立 association 文件，直接检测模型文件中的**嵌入式关联**（`.belongsTo()` / `.hasMany()`）
- 5 个模块共生成 **78 个测试文件**，耗时仅 1 秒出头
- 同时兼容扁平（`models/*.ts`）和嵌套（`models/module/*.ts`）目录结构

## 配置示例

```typescript
// opencroc.config.ts
import { defineConfig } from 'opencroc';

export default defineConfig({
  // 后端源码路径
  backend: {
    modelsDir: 'src/models',
    controllersDir: 'src/controllers',
    servicesDir: 'src/services',
  },

  // 目标应用
  baseUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000/api',

  // AI 配置
  ai: {
    provider: 'openai',        // 'openai' | 'zhipu' | 'custom'
    apiKey: process.env.AI_API_KEY,
    model: 'gpt-4o-mini',
  },

  // 测试执行
  execution: {
    workers: 4,
    timeout: 30_000,
    retries: 1,
  },

  // 日志驱动完成判定（需后端埋点）
  logCompletion: {
    enabled: true,
    endpoint: '/internal/test-logs',
    pollIntervalMs: 500,
    timeoutMs: 10_000,
  },

  // 自愈
  selfHealing: {
    enabled: false,
    fixScope: 'config-only',   // 'config-only' | 'config-and-source'
    maxFixRounds: 3,
    dryRunFirst: true,
  },
});
```

## 支持的技术栈

| 层级 | 已支持 | 规划中 |
|---|---|---|
| **ORM** | Sequelize, TypeORM, Prisma, Drizzle | — |
| **Framework** | Express | NestJS, Fastify, Koa |
| **Test Runner** | Playwright | — |
| **LLM** | OpenAI, ZhiPu (GLM), Ollama (local) | Anthropic |
| **Database** | MySQL, PostgreSQL | SQLite, MongoDB |

## 对比

| 功能 | OpenCroc | Playwright | Metersphere | auto-playwright |
|---|---|---|---|---|
| 源码感知生成 | ✅ | ❌ | ❌ | ❌ |
| AI 配置生成 + 校验 | ✅ | ❌ | ❌ | ❌ |
| 日志驱动完成判定 | ✅ | ❌ | ❌ | ❌ |
| 失败链路归因 | ✅ | ❌ | 部分 | ❌ |
| 自愈 + 回滚 | ✅ | ❌ | ❌ | ❌ |
| API 依赖 DAG | ✅ | ❌ | ❌ | ❌ |
| 零配置测试生成 | ✅ | 仅 codegen | 手工 | NL->action |
| 影响面分析 | ✅ | ❌ | ❌ | ❌ |

## Roadmap

- [x] 6-stage source-to-test pipeline
- [x] AI configuration generation with 3-layer validation
- [x] Controlled self-healing loop
- [x] Log-driven completion detection
- [x] Failure chain attribution + impact analysis
- [x] TypeORM / Prisma adapter
- [x] Ollama local LLM support
- [x] Real-world validation (102 tables, 65 relations, 78 generated tests)
- [x] GitHub Actions / GitLab CI integration
- [x] VS Code extension scaffold
- [x] Plugin system
- [x] HTML / JSON / Markdown report generation
- [x] NestJS controller parser
- [x] Visual dashboard (opencroc.com)
- [x] Drizzle ORM adapter

## 发布快照

- 当前稳定版本：`0.6.1`
- npm `latest` 标签：`0.6.1`
- Roadmap 状态：已全部完成
- 全量质量门禁：Windows 下 23 个测试文件 / 184 个测试稳定通过

### 版本节奏

- `0.3.x`：插件系统、CI 模板、报告系统、VS Code 脚手架、CI 稳定化
- `0.4.x`：NestJS 控制器解析
- `0.5.x`：Drizzle ORM 适配器
- `0.6.x`：可视化 dashboard 与 Windows 下 Vitest 稳定性收口

### 发布验证

```bash
npm run lint
npm run typecheck
npm test
npm view opencroc version dist-tags --json
```

## 文档

访问 **[opencroc.com](https://opencroc.com)** 查看完整文档，或阅读：

- [Architecture Guide](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Backend Instrumentation Guide](docs/backend-instrumentation.md)
- [AI Provider Setup](docs/ai-providers.md)
- [Self-Healing Guide](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)

## 贡献

欢迎贡献代码与文档。请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE) © 2026 OpenCroc Contributors
