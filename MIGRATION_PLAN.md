# OpenCroc 迁移执行计划

> 迁移源：`tests/e2e-ai/dynamic-gen/`
> 迁移目标：`opencroc/src/`
> 状态：骨架已搭建，所有核心函数为空壳 `throw Error`

---

## 总览：4 个 Sprint、22 个任务

```
Sprint 0  基础设施 ─────────────────────────────────────  预计 4 任务
Sprint 1  核心管道 (P0) ─────────────────────────────────  预计 8 任务
Sprint 2  AI 工具链 (P1-P2) ─────────────────────────────  预计 6 任务
Sprint 3  业务补充 (P2-P3) ─────────────────────────────  预计 4 任务
```

---

## Sprint 0 — 基础设施（先决条件）

> 目标：确保构建、测试、适配器基座可用

| # | 任务 | 源文件 | 目标文件 | 依赖 | 验收标准 |
|---|------|--------|----------|------|----------|
| 0.1 | **搭建 vitest 测试基座** | — | `opencroc/tests/setup.ts` | 无 | `pnpm test` 能跑空 suite |
| 0.2 | **实现 Sequelize 适配器** | `dynamic-gen/parsers/*` (调用方式) | `src/adapters/sequelize-adapter.ts` | 无 | `BackendAdapter` 接口全部实现 |
| 0.3 | **实现 LLM Provider 适配器** (OpenAI/Zhipu/Ollama) | `dynamic-gen/tools/` 中的 `llmRequest` | `src/adapters/llm/` | 无 | 3 个 provider 能发送 chat 请求 |
| 0.4 | **配置加载器** (cosmiconfig 集成) | `dynamic-gen/tools/config-loader.ts` | `src/config.ts` 增强 | 无 | `loadConfig()` → `ResolvedConfig` |

### 产出物
- [x] `pnpm build` + `pnpm test` 通过
- [x] Adapter 抽象可用
- [x] 配置文件能从 `opencroc.config.ts` 读取并解析

---

## Sprint 1 — 核心管道（P0 — 必须先完成）

> 目标：6 阶段 Pipeline 全部跑通，能从后端源码 → 生成 Playwright 测试文件

### 执行顺序严格按依赖链：

```
0.2 Adapter ──┐
              ├──→ 1.1 Model Parser ──→ 1.3 ER Diagram Gen ──┐
              ├──→ 1.2 Controller Parser ──────────────────────┤
              │                                                ├─→ 1.5 API Chain Analyzer
              └──→ 1.2b Association Parser ───→ 1.3 ER Diagram│
                                                               │
                    1.5 API Chain ──→ 1.6 Chain Planner ──→ 1.7 Test Code Generator
                                                               │
                                     1.4 Mock Data Gen ───────┘
                                                               ↓
                                                    1.8 Pipeline 串联
```

| # | 任务 | 源文件 | 目标文件 | 依赖 | 验收标准 |
|---|------|--------|----------|------|----------|
| 1.1 | **Model Parser** (ts-morph) | `dynamic-gen/parsers/model-parser.ts` | `src/parsers/model-parser.ts` | 0.2 | 解析 Sequelize model → `TableSchema[]` |
| 1.2 | **Controller Parser** (ts-morph) | `dynamic-gen/parsers/controller-parser.ts` | `src/parsers/controller-parser.ts` | 0.2 | 提取路由 → `RouteEntry[]` |
| 1.2b | **Association Parser** | `dynamic-gen/parsers/association-parser.ts` | `src/parsers/association-parser.ts` | 0.2 | 解析关联 → `ForeignKeyRelation[]` |
| 1.3 | **ER Diagram Generator** | `dynamic-gen/generators/er-diagram-generator.ts` | `src/generators/er-diagram-generator.ts` | 1.1, 1.2b | 输出 Mermaid ER 图文本 |
| 1.4 | **Mock Data Generator** | `dynamic-gen/generators/mock-data-generator.ts` | `src/generators/mock-data-generator.ts` | 1.1 | 按字段类型生成假数据 |
| 1.5 | **API Chain Analyzer** | `dynamic-gen/analyzers/api-chain-analyzer.ts` | `src/analyzers/api-chain-analyzer.ts` | 1.2 | 构建 DAG + 拓扑排序 |
| 1.6 | **Chain Planner** ⭐ 新增目录 | `dynamic-gen/planners/chain-planner.ts` | `src/planners/chain-planner.ts` | 1.5 | 输出 `TestChain[]` |
| 1.7 | **Test Code Generator** | `dynamic-gen/generators/test-code-generator.ts` | `src/generators/test-code-generator.ts` | 1.6, 1.4 | 输出 `.test.ts` 文件 |
| 1.8 | **Pipeline 6 阶段串联** | `dynamic-gen/pipeline.ts` | `src/pipeline/index.ts` | 1.1-1.7 全部 | `createPipeline(config).run()` 跑通 |

### 迁移注意事项
- `dynamic-gen/parsers/dto-parser.ts` 额外解析器 → 评估是否纳入（建议 Sprint 3 再考虑）
- `dynamic-gen/module-registry.ts` → 融入 Pipeline scan 阶段
- `dynamic-gen/analyzers/chain-failure-analyzer.ts` → 迁入 `src/analyzers/`
- `dynamic-gen/analyzers/impact-reporter.ts` → 迁入 `src/analyzers/`

### 产出物
- [x] `npx opencroc generate --all` 完整执行
- [x] 输出 `opencroc-output/` 含 ER 图 + 测试文件
- [x] 每个模块有对应的单元测试

---

## Sprint 2 — AI 工具链（P1 + 部分 P2）

> 目标：AI 辅助配置生成 + 自动修复 + 验证器

### 执行顺序：

```
0.3 LLM Provider ──→ 2.1 AI Config Suggester ──→ 2.2 Enhanced AI Suggester
                  └──→ 2.3 Auto-Fixer (四策略) ──→ 2.4 Self-Healing Loop
                  └──→ 2.5 三层验证器
                  └──→ 2.6 LLM Chain Planner
```

| # | 任务 | 源文件 | 目标文件 | 依赖 | 验收标准 |
|---|------|--------|----------|------|----------|
| 2.1 | **AI Config Suggester** | `dynamic-gen/tools/ai-config-suggester.ts` | `src/tools/ai-config-suggester.ts` | 0.3 | 用 LLM 分析源码 → 输出模块 JSON 配置建议 |
| 2.2 | **Enhanced AI Suggester** ⭐ P1 | `dynamic-gen/tools/enhanced-ai-suggester.ts` | `src/tools/enhanced-ai-suggester.ts` | 2.1 | 增强版：多轮对话 + 上下文感知 + 置信度评分 |
| 2.3 | **Auto-Fixer (四策略)** ⭐ P1 | `dynamic-gen/tools/auto-fixer.ts` | `src/tools/auto-fixer.ts` | 0.3 | 4 种修复策略：selector / endpoint / assertion / timing |
| 2.4 | **Self-Healing Loop 串联** | `dynamic-gen/` 中散落的 healing 逻辑 | `src/self-healing/index.ts` | 2.3 | 迭代修复循环完整工作 |
| 2.5 | **三层验证器** ⭐ P2 | `dynamic-gen/validators/` (schema + semantic + dryrun) | `src/validators/` | 1.8 | 3 个验证器 + 统一入口 `validateConfig()` |
| 2.6 | **LLM 约束链路规划器** ⭐ P2 | `dynamic-gen/planners/chain-planner.ts` (LLM 部分) | `src/planners/chain-planner.ts` 增强 | 1.6, 0.3 | 用 LLM 优化链路规划的约束推理 |

### 源文件详细映射

```
dynamic-gen/tools/ai-config-suggester.ts    → src/tools/ai-config-suggester.ts
dynamic-gen/tools/enhanced-ai-suggester.ts  → src/tools/enhanced-ai-suggester.ts
dynamic-gen/tools/auto-fixer.ts             → src/tools/auto-fixer.ts
dynamic-gen/validators/schema-validator.ts  → src/validators/schema-validator.ts
dynamic-gen/validators/semantic-validator.ts→ src/validators/semantic-validator.ts
dynamic-gen/validators/dryrun-validator.ts  → src/validators/dryrun-validator.ts
dynamic-gen/validators/types.ts             → src/validators/types.ts
```

### 产出物
- [x] `npx opencroc heal` 完整工作
- [x] `npx opencroc validate` 运行三层验证
- [x] AI 配置建议器可通过 CLI 调用

---

## Sprint 3 — 业务补充（P3 + 收尾）

> 目标：基线对比、预生成配置、额外工具、CLI 增强

| # | 任务 | 源文件 | 目标文件 | 依赖 | 验收标准 |
|---|------|--------|----------|------|----------|
| 3.1 | **Baseline Comparator** ⭐ P3 | `dynamic-gen/tools/baseline-comparator.ts` | `src/tools/baseline-comparator.ts` | 1.8 | 新旧配置 diff + 回归检测 |
| 3.2 | **71 个模块配置迁移** ⭐ P3 | `dynamic-gen/module-configs/*.json` (71个) | `opencroc/module-configs/` 或打包为内置 preset | 无 | 所有配置通过三层验证 |
| 3.3 | **CLI 子命令完善** | `dynamic-gen/cli.ts` + `tools/enhanced-cli.ts` | `src/cli/commands/*` | 2.x 全部 | generate/test/heal/validate 全功能 |
| 3.4 | **DTO Parser** (可选) | `dynamic-gen/parsers/dto-parser.ts` | `src/parsers/dto-parser.ts` | 1.1 | 解析 DTO 类 → 增强 mock 生成 |

### 产出物
- [x] 完整 CLI 工具链
- [x] 71 个模块开箱可用
- [x] 基线对比可防回归

---

## 全量依赖图

```
Sprint 0                Sprint 1                  Sprint 2              Sprint 3
─────────────────────────────────────────────────────────────────────────────────
                                                                        
0.1 Test Base            ─────────────────────────────────────────────→ (贯穿)
                                                                        
0.2 Adapter ────→ 1.1 Model Parser ──→ 1.3 ER Diagram                  
             ├──→ 1.2 Controller Parser ──→ 1.5 API Chain               
             └──→ 1.2b Association Parser ─┘       │                    
                                                   ↓                    
                  1.4 Mock Data ──→ 1.6 Chain Planner                   
                                        │                               
                                        ↓                               
                                   1.7 Test Codegen                     
                                        │                               
                                        ↓                               
                                   1.8 Pipeline ──→ 2.5 三层验证 ──→ 3.1 Baseline
                                        │                               
0.3 LLM Provider ──→ 2.1 AI Suggester ──→ 2.2 Enhanced ──→ 3.3 CLI    
                  ├──→ 2.3 Auto-Fixer ──→ 2.4 Healing Loop             
                  └──→ 2.6 LLM Planner                                 
                                                              3.2 Configs
                                                              3.4 DTO   
```

---

## 单任务执行模板

每个任务按以下步骤执行：

```
1. 📖 阅读源文件 (dynamic-gen/xxx)
2. 🔍 识别 dynamic-gen 独有依赖，映射到 opencroc 接口
3. ✏️  编写实现代码 (opencroc/src/xxx)
4. 🧪 编写单元测试 (opencroc/tests/xxx.test.ts)
5. 📝 更新 src/index.ts 导出 (如有新增模块)
6. 📝 更新 src/types.ts (如有新增类型)
7. ✅ pnpm build && pnpm test 通过
8. 🔗 集成测试：与上下游模块联调
```

---

## 风险项 & 决策点

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| `dynamic-gen` 直接使用 `llmRequest()` 函数，非 Provider 接口 | 所有 LLM 调用需重构为 `LlmProvider.chat()` | Sprint 0 先建好 Provider，迁移时统一替换 |
| `dynamic-gen` 的 71 个 JSON 配置内嵌了项目特定路径 | 直接搬过来可能不通用 | Sprint 3 做参数化处理，提取为 preset template |
| `ts-morph` AST 解析逻辑与项目 Sequelize 版本耦合 | 换项目可能解析失败 | 增加 Adapter 层容错 + 文档说明支持的 ORM 版本 |
| `dynamic-gen` 无独立构建，依赖 workspace tsconfig | ESM 包构建可能有路径问题 | Sprint 0.1 先验证 tsup build 输出正确 |

---

## 快速参考：文件计数

| 类别 | dynamic-gen (源) | opencroc (当前) | 迁移后目标 |
|------|-----------------|-----------------|-----------|
| 源码 .ts | ~25 | 15 (空壳) | ~30 |
| 测试 .test.ts | 7+ | 0 | 15+ |
| 模块配置 .json | 71 | 0 | 71 |
| 文档 .md | 3 | 4 | 6+ |
| **合计** | **~106** | **19** | **~122** |
