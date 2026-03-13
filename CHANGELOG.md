# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-03-13

### Fixed
- **CI pipeline fix**: upgraded `eslint` from `^9.0.0` to `^10.0.0` to resolve peer dependency conflict with `@eslint/js@10.0.1` (which requires `eslint@^10.0.0`)
- Changed CI/Release workflows from `npm install` to `npm ci` for deterministic installs

## [0.3.0] - 2026-03-13

### Added
- **Plugin system** (`src/plugins/`) — extensible hook-based architecture
  - `createPluginRegistry()` — register, unregister, invoke hooks across plugins
  - `definePlugin()` — type-safe plugin definition helper
  - Lifecycle hooks: `setup`, `teardown`, `transformConfig`, `beforePipeline`, `afterPipeline`, `beforeStep`, `afterStep`, `onError`
  - Config transforms applied sequentially across registered plugins
- **CI template generators** (`src/ci/`) — ready-to-use CI/CD pipelines
  - `generateGitHubActionsTemplate()` — GitHub Actions workflow with Playwright, artifact upload
  - `generateGitLabCITemplate()` — GitLab CI pipeline with multi-stage (generate → test)
  - `generateCiTemplate()` — platform dispatcher, `listCiPlatforms()`
  - Options: custom Node versions, install command, self-heal step, generate/test args
- **Report generators** (`src/reporters/`) — multi-format pipeline reports
  - `generateHtmlReport()` — dark-themed dashboard with summary cards, tables, validation issues
  - `generateJsonReport()` — serializable JSON output
  - `generateMarkdownReport()` — structured Markdown with sections
  - `generateReports()` — orchestrator for multiple formats
  - HTML reporter includes XSS protection via `escapeHtml()`
- **VSCode extension scaffold** (`src/vscode/`) — everything needed to build the extension
  - `generateExtensionManifest()` — complete `package.json` with commands, views, configuration
  - `generateExtensionEntrypoint()` — TypeScript source for `extension.ts` with all command registrations
  - `buildModuleTree()` / `buildStatusTree()` — sidebar tree view data providers
  - 9 commands: init, generate, generateModule, test, testModule, validate, heal, openReport, ci
- **CLI commands**: `opencroc ci` (generate CI templates) and `opencroc report` (generate reports)
- 49 new tests across 4 modules (plugins: 10, ci: 11, reporters: 11, vscode: 13, exports: 4)
- Total: 20 test files, 161 tests

### Changed
- CLI version bumped to 0.3.0
- CLI now has 7 commands: init, generate, test, validate, heal, ci, report
- Updated all READMEs (EN, ZH, JA) with refreshed roadmap
- Public API exports expanded with plugins, CI, reporters, VSCode modules

## [0.2.0] - 2026-03-14

### Summary

First stable release of the 0.2.x series. Includes all features from alpha/beta/rc pre-releases:

- **ORM Adapters**: Sequelize, TypeORM (`@Entity`/`@Column`/`@ManyToOne` via ts-morph), Prisma (`.prisma` schema parser), adapter registry with auto-detection
- **LLM Integration**: OpenAI/Zhipu/Ollama providers, token tracking, system prompts, LLM-enhanced failure analysis with heuristic fallback
- **Real-World Validation**: Tested on production-scale RBAC system — 102 tables, 65 relations, 78 generated test files in ~1.2s
- **Flat Layout Support**: Pipeline handles both flat (`models/*.ts`) and nested (`models/module/*.ts`) directory structures
- **Embedded Associations**: Detects `.belongsTo()`/`.hasMany()` calls inside model files without dedicated association files

See individual pre-release entries below for detailed changelogs.

## [0.2.0-rc.1] - 2026-03-14

### Added
- **Real-world validation** on production-scale RBAC system (100+ models, 75+ controllers)
  - 102 tables, 65 foreign key relations, 78 generated test files in ~1.2s
  - Example config and smoke test at `examples/rbac-system/`
- **Flat model layout support** — `resolveModelDir()` / `resolveControllerDir()` helpers for backends that place all models/controllers in a single directory instead of per-module subdirectories
- **Embedded association scanning** — detects `.belongsTo()`, `.hasMany()`, `.hasOne()`, `.belongsToMany()` calls inside model files, no dedicated `associations.ts` required
- **Root-level module inclusion** — pipeline now detects root-level `.ts` files in `models/` as "default" module alongside subdirectory-based modules
- Updated all READMEs (EN, ZH, JA) with real-world validation results, updated tech stack tables, and refreshed roadmap

### Changed
- Pipeline Step 1 (scan): improved directory structure detection for flat vs nested layouts
- Pipeline Step 2 (er-diagram): scans all model files for embedded associations
- Pipeline Steps 3-4: use `resolveControllerDir()` for consistent path resolution
- Tech stack tables updated: TypeORM, Prisma, Ollama moved to "Supported"
- Roadmap updated with completed items

## [0.2.0-beta.1] - 2026-03-13

### Added
- **LLM module** (`src/llm/`) — pluggable LLM provider system
  - `createOpenAIProvider()` — OpenAI + Zhipu (GLM) compatible client via native `fetch`
  - `createOllamaProvider()` — local Ollama inference client
  - `createLlmProvider()` — factory with env variable fallback (`OPENCROC_LLM_API_KEY`)
  - `createTokenTracker()` — accumulates token estimates across calls
  - `SYSTEM_PROMPTS` — built-in system prompts for failure analysis and chain planning
- `analyzeFailureWithLLM()` — LLM-enhanced failure analysis with heuristic fallback
- 22 new LLM-related unit tests (112 total)
- Public exports: `createLlmProvider`, `createOpenAIProvider`, `createOllamaProvider`, `createTokenTracker`, `SYSTEM_PROMPTS`, `analyzeFailureWithLLM`

### Changed
- `createSelfHealingLoop()` now accepts optional `LlmProvider` parameter
- Self-healing loop tracks token usage when LLM is provided

## [0.2.0-alpha.1] - 2026-03-13

### Added
- **Sequelize adapter** (`src/adapters/sequelize.ts`) — wraps existing parsers as BackendAdapter
- **TypeORM adapter** (`src/adapters/typeorm.ts`) — parses `@Entity`, `@Column`, `@PrimaryGeneratedColumn`, `@ManyToOne`/`@OneToMany`/`@OneToOne` decorators, `@JoinColumn` FK extraction
- **Prisma adapter** (`src/adapters/prisma.ts`) — regex-based `.prisma` schema parser with `@@map`, `@relation`, `@id`, `@unique`, `@default` support
- **Adapter registry** (`src/adapters/registry.ts`) — `createAdapter()`, `detectAdapter()` (auto-detect from project structure), `resolveAdapter()`
- TypeORM fixture (`__fixtures__/typeorm-entities.ts`) and Prisma fixture (`__fixtures__/schema.prisma`)
- 17 new unit tests across all adapters and registry (90 total)
- Public exports: `createSequelizeAdapter`, `createTypeORMAdapter`, `createPrismaAdapter`, `createAdapter`, `detectAdapter`, `resolveAdapter`

### Changed
- `tsconfig.json` excludes `__fixtures__/` from type checking

## [0.1.10] - 2026-03-13

### Added
- `opencroc validate` command — config + pipeline validation with error/warning reporting
  - Runs `scan` + `validate` pipeline steps, merges config-level and module-level errors
  - Sets `process.exitCode = 1` on errors (CI-friendly)
- `opencroc test` command — discovers and runs generated Playwright tests
  - Auto-discovers `*.spec.ts` and `*.test.ts` in outDir
  - `--module` filter, `--headed` mode
  - Spawns `npx playwright test` with proper args
- `opencroc heal` command — runs self-healing loop on test failures
  - `--max-iterations` flag (default: 3)
  - Reads `selfHealing.mode` from config
  - Reports iterations, fixed items, remaining issues, token usage
- 10 new unit tests (validate: 3, test: 4, heal: 3)

### Changed
- CLI version bumped to 0.1.10
- All 5 CLI commands now fully implemented (init, generate, test, validate, heal)

## [0.1.9] - 2026-03-13

### Added
- `opencroc generate` command — full pipeline execution from CLI
  - `--module <name>` filter for single-module generation
  - `--steps <steps>` to run specific pipeline steps (comma-separated)
  - `--dry-run` mode to preview generated files without writing
  - Summary output with module count, ER diagrams, chain plans, errors/warnings
- Config loader (`src/cli/load-config.ts`) — cosmiconfig-based config discovery
  - Searches `opencroc.config.{ts,js,json}`, `.opencrocrc.json`, `package.json`
  - Validates `backendRoot` presence
- 8 new unit tests (load-config: 3, generate command: 5)

### Changed
- CLI version bumped to 0.1.9

## [0.1.8] - 2026-03-14

### Added
- Interactive `opencroc init` command with prompts for backend root, ORM adapter (sequelize/typeorm/prisma), LLM provider (openai/zhipu/ollama/none), and output directory
- `--yes` / `-y` flag for non-interactive init with sensible defaults
- `buildConfigContent()` exported for programmatic config generation
- 5 unit tests for config content generation

### Changed
- CLI version bumped from 0.1.0 to 0.1.8

## [0.1.7] - 2026-03-13

### Added
- ESLint 9 flat config with `typescript-eslint` (`eslint.config.js`)
- 22 unit tests across 5 test files (config, validators, pipeline, parsers, public API exports)
- Lint step in CI pipeline (Install → Lint → Build → Typecheck → Test)
- CI status badge to all README variants (EN, ZH, JA)
- CHANGELOG.md (this file)

### Changed
- Hardened `release.yml`: `fetch-depth: 0` + main-branch tag verification step
- Normalized `repository.url` and `bin` path via `npm pkg fix`

## [0.1.6] - 2026-03-12

### Added
- Banner image (`assets/banner.png`)
- Multilingual README: English (`README.en.md`), Chinese (`README.zh-CN.md`), Japanese (`README.ja.md`)
- Language navigation links in all READMEs

## [0.1.5] - 2026-03-12

### Fixed
- npm publish without `--provenance` for compatibility

## [0.1.4] - 2026-03-12

### Added
- npm auth preflight checks in release pipeline (`npm whoami`, `npm ping`)

## [0.1.3] - 2026-03-12

### Fixed
- Release pipeline configuration

## [0.1.2] - 2026-03-12

### Fixed
- Workflow `working-directory` corrected from `opencroc` to `.`

## [0.1.1] - 2026-03-12

### Added
- Initial npm publish

## [0.1.0] - 2026-03-12

### Added
- Project scaffold: 6-stage pipeline architecture
- CLI with 5 commands: `init`, `generate`, `test`, `validate`, `heal`
- Source parsers: model, controller, association (Sequelize/TypeORM/Prisma stubs)
- Generators: test code, mock data, ER diagram
- Analyzers: API chain, impact reporter
- Self-healing loop skeleton
- TypeScript + tsup build (ESM + DTS)
- GitHub Actions CI (`ci.yml`) with Node 20.x/22.x matrix
- GitHub Actions release (`release.yml`) with tag-triggered npm publish

[Unreleased]: https://github.com/opencroc/opencroc/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/opencroc/opencroc/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/opencroc/opencroc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/opencroc/opencroc/compare/v0.2.0-rc.1...v0.2.0
[0.2.0-rc.1]: https://github.com/opencroc/opencroc/compare/v0.2.0-beta.1...v0.2.0-rc.1
[0.2.0-beta.1]: https://github.com/opencroc/opencroc/compare/v0.2.0-alpha.1...v0.2.0-beta.1
[0.2.0-alpha.1]: https://github.com/opencroc/opencroc/compare/v0.1.10...v0.2.0-alpha.1
[0.1.10]: https://github.com/opencroc/opencroc/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/opencroc/opencroc/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/opencroc/opencroc/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/opencroc/opencroc/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/opencroc/opencroc/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/opencroc/opencroc/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/opencroc/opencroc/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/opencroc/opencroc/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/opencroc/opencroc/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/opencroc/opencroc/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/opencroc/opencroc/releases/tag/v0.1.0
