# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/opencroc/opencroc/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/opencroc/opencroc/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/opencroc/opencroc/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/opencroc/opencroc/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/opencroc/opencroc/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/opencroc/opencroc/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/opencroc/opencroc/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/opencroc/opencroc/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/opencroc/opencroc/releases/tag/v0.1.0
