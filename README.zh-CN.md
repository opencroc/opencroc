<p align="center">
  <img src="assets/banner.png" alt="OpenCroc 横幅" width="820" />
</p>

<h1 align="center">OpenCroc</h1>

<p align="center">
  <strong>AI 原生 E2E 测试框架：读取源码、生成测试，并对失败进行自愈。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencroc"><img src="https://img.shields.io/npm/v/opencroc?color=green" alt="npm version" /></a>
  <a href="https://github.com/opencroc/opencroc/actions/workflows/ci.yml"><img src="https://github.com/opencroc/opencroc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/opencroc/opencroc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/opencroc/opencroc" alt="MIT License" /></a>
  <a href="https://opencroc.com"><img src="https://img.shields.io/badge/docs-opencroc.com-blue" alt="Documentation" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.ja.md">日本語</a>
</p>

---

## OpenCroc 是什么？

OpenCroc 是一个构建在 [Playwright](https://playwright.dev) 之上的 AI 原生端到端测试框架。它不要求你手写大量测试脚本，而是直接读取后端源码，理解模型、控制器、DTO 与关系后，自动生成完整的 E2E 测试套件，包括种子数据、请求体、API 调用链和断言。

当测试失败时，OpenCroc 不只是输出报错。它会沿着请求链路追踪问题，归因可能的根因，生成修复建议，并在受控流程中重新执行验证。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 源码感知生成 | 解析 Sequelize、TypeORM、Prisma、Drizzle 结构，识别模块、模型、路由与 DTO |
| AI 配置生成 | 生成请求模板、种子数据计划、参数映射与测试脚手架，并经过校验 |
| 调用链规划 | 构建依赖 DAG，规划更高覆盖率的 API 执行顺序 |
| 日志驱动完成判定 | 不只依赖 `networkidle`，还能结合后端执行信号判断是否真正完成 |
| 失败归因 | 关联前端请求、后端日志与依赖链路，定位问题来源 |
| 受控自愈 | 支持 backup、patch、dry-run、re-run、verify、rollback 等闭环 |
| 可视化 Studio | 提供本地 Web UI，用于图谱探索、Agent 状态观察和像素办公室展示 |

## 快速开始

### 前置要求

- Node.js 18 或更高版本
- 使用 Express 或 NestJS 的后端项目
- 使用受支持的 ORM 或模式结构

### 安装

```bash
npm install opencroc --save-dev
```

### 初始化

```bash
npx opencroc init
```

这条命令会：

1. 扫描项目结构
2. 识别框架与 ORM 特征
3. 创建 `opencroc.config.ts`
4. 生成起步用的输出结构

### 生成测试

```bash
# 为单个模块生成测试
npx opencroc generate --module=knowledge-base

# 为所有检测到的模块生成测试
npx opencroc generate --all

# 仅预览，不落盘
npx opencroc generate --all --dry-run
```

### 运行测试

```bash
# 运行全部生成的测试
npx opencroc test

# 运行单个模块
npx opencroc test --module=knowledge-base

# 以 headed 模式运行
npx opencroc test --headed

# 通过 CLI 覆盖生命周期钩子
npx opencroc test --setup-hook="npm run e2e:setup" --auth-hook="node scripts/auth.js" --teardown-hook="npm run e2e:cleanup"
```

### 校验 AI 配置

```bash
npx opencroc validate --all
npx opencroc compare --baseline=report-a.json --current=report-b.json
```

## OpenCroc Studio

OpenCroc Studio 是 OpenCroc 的本地可视化工作台。它把知识图谱视图、像素办公室运营视图和 3D 办公室运行时整合在一个由 CLI 启动的 Web 体验中。

### 启动 Studio

```bash
# 启动 Studio 并打开浏览器
npx opencroc serve

# 自定义端口
npx opencroc serve --port 3000

# 禁止自动打开浏览器
npx opencroc serve --no-open

# 绑定公开 host
npx opencroc serve --host 0.0.0.0 --port 8765
```

### 当前 Web 架构

- Fastify 提供本地 Studio 应用与 API 服务
- 前端是单入口 Vite SPA
- 主路由为 `/`、`/studio`、`/pixel`
- Web 源码位于 `src/web`，按 `app`、`pages`、`features`、`shared`、`styles`、`public` 分层
- 历史入口如 `/index-studio.html`、`/index-v2-pixel.html` 会被重定向到 SPA 路由

### Studio 能力

- 模块、API 与关系的知识图谱画布
- 展示 Agent 活动的像素办公室仪表盘
- 用于沉浸式监控的 3D 办公室运行时视图
- 基于 WebSocket 的实时状态更新
- 支持路由切换的侧边导航
- REST 接口，例如 `GET /api/project`、`GET /api/agents`、`POST /api/project/refresh`

## 完整流水线

```bash
# 执行完整流水线
npx opencroc run

# 对单个模块启用自愈并输出报告
npx opencroc run --module=users --self-heal --report html,json
```

## CI/CD 集成

```bash
npx opencroc ci --platform github
npx opencroc ci --platform gitlab --self-heal
```

## Dashboard 与报告

```bash
npx opencroc dashboard
npx opencroc report --format html,json,markdown
```

## 架构

```text
+-------------------------------------------------------------------+
| OpenCroc Studio                                                   |
| Fastify 服务 + 单入口 Vite SPA + WebSocket 更新                   |
| 路由：/, /studio, /pixel                                          |
+-------------------------------------------------------------------+
| CLI / Orchestrator                                                |
+--------------+--------------+---------------+----------------------+
| 源码解析     | 链路规划     | 测试生成      | 执行 / 观察          |
+--------------+--------------+---------------+----------------------+
| 自愈         | 影响分析     | 报告输出      | Dashboard / Studio   |
+--------------+--------------+---------------+----------------------+
```

### 6 阶段流水线

```text
Source Scan -> ER Diagram -> API Analysis -> Chain Planning -> Test Generation -> Failure Analysis
```

## 工作原理

### 1. 源码解析

OpenCroc 使用 [ts-morph](https://ts-morph.com) 以及框架感知解析器来分析：

- 模型与关系
- 控制器与路由
- DTO 字段与校验规则
- 模块边界与依赖面

### 2. AI 配置生成

针对每个模块，OpenCroc 可以生成：

- 请求体模板
- 种子数据计划
- 参数映射
- ID 别名规则

每份配置都要经过以下校验：

1. Schema 校验
2. 语义校验
3. Dry-run 校验

### 3. 日志驱动完成判定

OpenCroc 不只依赖浏览器空闲信号，还能结合后端完成信号来判断请求是否真正结束。

### 4. 自愈闭环

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

## 真实项目验证

OpenCroc 已在一个生产风格的 RBAC 系统上完成验证，项目包含 100+ Sequelize 模型、数十个控制器以及嵌入式关联定义。

```bash
$ npx tsx examples/rbac-system/smoke-test.ts

Modules        : 5
ER Diagrams    : 5
Chain Plans    : 5
Generated Files: 78
Duration       : 1153ms
```

关键结果：

- 从扁平模型布局中提取出 102 张表与 65 条外键关系
- 无需单独 association 文件即可识别嵌入式关联
- 在 5 个模块上生成了 78 个测试文件
- 同时兼容扁平与嵌套目录结构

## 配置示例

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

## 支持的技术栈

| 层 | 已支持 | 计划中 |
| --- | --- | --- |
| ORM | Sequelize, TypeORM, Prisma, Drizzle | 视需求继续扩展 |
| Framework | Express | NestJS, Fastify, Koa |
| Test Runner | Playwright | 更多运行器 |
| LLM | OpenAI, ZhiPu, Ollama | Anthropic |
| Database | MySQL, PostgreSQL | SQLite, MongoDB |

## 对比

| 功能 | OpenCroc | Playwright | Metersphere | auto-playwright |
| --- | --- | --- | --- | --- |
| 源码感知生成 | Yes | No | No | No |
| AI 配置生成与校验 | Yes | No | No | No |
| 日志驱动完成判定 | Yes | No | No | No |
| 失败归因 | Yes | No | Partial | No |
| 自愈与回滚 | Yes | No | No | No |
| API 依赖 DAG | Yes | No | No | No |
| 零配置测试生成 | Yes | Limited | Manual | Prompt-driven |
| 影响分析 | Yes | No | No | No |

## 路线图

- [x] 6 阶段源码到测试流水线
- [x] AI 配置生成与校验
- [x] 受控自愈闭环
- [x] 日志驱动完成判定
- [x] 失败归因与影响分析
- [x] Prisma 与 Drizzle 适配
- [x] Ollama 本地模型支持
- [x] CI 集成
- [x] VS Code 插件脚手架
- [x] 插件系统
- [x] HTML、JSON、Markdown 报告
- [x] 可视化 Studio 仪表盘
- [x] Runtime 基础设施
- [x] 全流程编排
- [x] 高级报告系统
- [x] OpenCroc Studio 路由化 Web 应用

## 版本快照

- 本文档对应的产品快照：`1.8.3`
- Studio 架构快照：Fastify + 单入口 Vite SPA + 路由视图
- 主 Studio 路由：`/`、`/studio`、`/pixel`
- 全量质量门禁：41 个测试文件、414 个测试通过

### 版本节奏

- `0.3.x`：插件系统、CI 模板、报告系统、VS Code 脚手架
- `0.4.x`：NestJS 控制器解析器
- `0.5.x`：Drizzle ORM 适配
- `0.6.x`：可视化 dashboard 与 Windows Vitest 稳定性工作
- `0.7.x - 0.9.x`：runtime 基础设施、认证、日志驱动检测、规则引擎
- `1.0.0`：全流程编排管道
- `1.1.0`：高级自愈
- `1.2.0`：高级报告与迁移工作
- `1.3.0`：OpenCroc Studio M1
- `1.8.3`：Vite SPA 路由化、web 架构整理、发包瘦身

### 发布验证

```bash
npm run lint
npm run typecheck
npm test
npm view opencroc version dist-tags --json
```

## 文档

访问 **[opencroc.com](https://opencroc.com)** 获取更多文档，也可以查看：

- [Architecture Guide](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Backend Instrumentation Guide](docs/backend-instrumentation.md)
- [AI Provider Setup](docs/ai-providers.md)
- [Self-Healing Guide](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)

## 贡献

欢迎贡献代码与文档。请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE) Copyright 2026 OpenCroc Contributors
