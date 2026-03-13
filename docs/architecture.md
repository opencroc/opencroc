# Architecture

OpenCroc follows a **6-stage pipeline** architecture that transforms backend source code into validated E2E tests.

## High-Level Flow

```
Source Code → [Scan] → [ER Diagram] → [API Chain] → [Plan] → [Codegen] → [Validate]
                                                                             ↓
                                                                    Playwright Tests
                                                                             ↓
                                                                    [Self-Healing Loop]
                                                                     ↓ fail → fix → retry
                                                                    Green Suite ✓
```

## Stage Breakdown

### 1. Scan

The **Module Registry** discovers backend modules by scanning the configured `backendRoot` directory. It uses the selected **Backend Adapter** (Sequelize, TypeORM, Prisma) to locate model files, controller files, and association definitions.

### 2. ER Diagram

The **Model Parser** (powered by ts-morph) extracts `TableSchema` and `ForeignKeyRelation` from ORM model files. The **ER Diagram Generator** produces Mermaid text for visualization and downstream dependency analysis.

### 3. API Chain

The **Controller Parser** extracts `RouteEntry` objects (method, path, handler). The **API Chain Analyzer** builds a directed acyclic graph of API dependencies and computes a topological ordering.

### 4. Plan

The **Chain Planner** takes the topological order and generates `TestChain` objects — ordered sequences of `TestStep` items with assertions, mock data, and dependency references.

### 5. Codegen

The **Test Code Generator** emits Playwright test files (`.test.ts`) from chain plans. Each file is self-contained with proper setup/teardown and references to generated mock data.

### 6. Validate

A **3-layer validation** pipeline checks the generated output:

1. **Schema Validation** — structural correctness of configs
2. **Semantic Validation** — logical consistency (e.g., referenced endpoints exist)
3. **Dry-Run Validation** — simulated execution to catch runtime issues

## Self-Healing Loop

When tests fail, the **Self-Healing** subsystem runs:

1. **Failure Attribution** — parse Playwright error + source context → send to LLM
2. **Root Cause Analysis** — LLM identifies whether the issue is in config, test code, or backend
3. **Controlled Fix** — apply minimal fix (config-only or config-and-source mode)
4. **Re-run** — execute the fixed test
5. **Iterate** — repeat up to `maxIterations` or until green

## Adapter System

OpenCroc is backend-agnostic via the `BackendAdapter` interface:

```typescript
interface BackendAdapter {
  name: string;
  parseModels(dir: string): Promise<TableSchema[]>;
  parseAssociations(file: string): Promise<ForeignKeyRelation[]>;
  parseControllers(dir: string): Promise<RouteEntry[]>;
}
```

Built-in adapters: `sequelize` (v0.1), `typeorm` (planned), `prisma` (planned).

## LLM Provider System

The `LlmProvider` interface abstracts AI services:

```typescript
interface LlmProvider {
  name: string;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  estimateTokens(text: string): number;
}
```

Built-in providers: `openai`, `zhipu`, `ollama`.

## Directory Structure

```
src/
├── cli/              # CLI entry point and commands
├── pipeline/         # 6-stage pipeline orchestrator
├── parsers/          # Source code parsers (model, controller, association)
├── generators/       # Code generators (test, mock data, ER diagram)
├── analyzers/        # API chain analysis and impact reporting
├── planners/         # Test chain planning
├── validators/       # 3-layer validation
├── self-healing/     # Failure attribution, controlled fix, dialog loop
├── adapters/         # Backend and LLM provider adapters
├── types.ts          # Core type definitions
├── config.ts         # defineConfig helper
└── index.ts          # Public API exports
```
