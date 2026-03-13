# Contributing to OpenCroc

Thank you for your interest in contributing to OpenCroc! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](https://github.com/opencroc/opencroc/issues/new?template=bug_report.md) issue template
- Include your Node.js version, OS, and OpenCroc version
- Provide a minimal reproduction if possible

### Suggesting Features

- Use the [Feature Request](https://github.com/opencroc/opencroc/issues/new?template=feature_request.md) issue template
- Describe the use case and expected behavior

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/my-feature`
3. **Make your changes** with clear, focused commits
4. **Add tests** for new functionality
5. **Run the test suite**: `npm test`
6. **Submit a PR** against `main`

### Branch Naming

| Prefix | Purpose |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring |
| `test/` | Test additions/changes |
| `chore/` | Build, CI, tooling |

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(parser): add TypeORM entity parser
fix(self-healing): prevent rollback on partial success
docs(readme): add Prisma to supported ORMs
test(pipeline): add chain planner edge case coverage
```

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/opencroc.git
cd opencroc

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Lint
npm run lint
```

## Project Structure

```
opencroc/
├── src/
│   ├── cli/              # CLI entry points
│   ├── core/             # Orchestrator, pipeline, config
│   ├── parsers/          # Source code parsers (ts-morph)
│   ├── generators/       # Test code + ER diagram generators
│   ├── planners/         # Chain planning (DAG + greedy)
│   ├── validators/       # 3-layer config validation
│   ├── self-healing/     # AI attribution + controlled fix
│   ├── reporters/        # HTML/JSON/Markdown reporters
│   ├── observation/      # Network monitor + log completion
│   └── adapters/         # ORM/framework adapters
├── tests/
│   ├── unit/             # Unit tests (Jest)
│   └── e2e/              # Integration tests
├── docs/                 # Documentation
└── examples/             # Example projects
```

## Key Design Principles

1. **Source-first**: Always derive test knowledge from actual source code, not guesses
2. **Safety gates**: Self-healing must have dry-run → verify → rollback at every step
3. **Adapter pattern**: ORM/framework support via pluggable adapters, not hardcoded logic
4. **Fail-open**: When AI is unavailable, fall back to heuristics — never block execution
5. **Observable**: Every decision point should produce a traceable artifact (JSON/Mermaid/log)

## Adding a New ORM Adapter

1. Create `src/adapters/<orm>-adapter.ts` implementing `BackendAdapter`
2. Add parser in `src/parsers/<orm>-model-parser.ts`
3. Register in `src/adapters/index.ts`
4. Add tests in `tests/unit/adapters/<orm>-adapter.test.ts`
5. Add example project in `examples/<orm>-example/`

## Adding a New LLM Provider

1. Create `src/ai/<provider>.ts` implementing `LlmProvider`
2. Register in `src/ai/index.ts`
3. Add to `opencroc.config.ts` provider union type
4. Document in `docs/ai-providers.md`

## Review Process

- All PRs require at least 1 approval
- CI must pass (lint + tests)
- Breaking changes require RFC discussion in an issue first

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
