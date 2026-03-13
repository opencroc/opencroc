# Self-Healing

OpenCroc's self-healing system automatically diagnoses and fixes failing E2E tests through an iterative AI-assisted loop.

## How It Works

```
Test Failure → Parse Error → LLM Attribution → Generate Fix → Apply → Re-run
                                                                  ↑         |
                                                                  └─────────┘
                                                               (up to N iterations)
```

### 1. Failure Attribution

When a Playwright test fails, the system collects:

- Error message and stack trace
- Network request/response logs
- Page screenshots (if available)
- Relevant source code context

This context is sent to the configured LLM for root cause analysis.

### 2. Root Cause Categories

The LLM classifies failures into:

| Category | Description | Fix Strategy |
|----------|-------------|-------------|
| `config-error` | Module config is incorrect (wrong selector, endpoint) | Update config JSON |
| `test-logic` | Generated test has wrong assertions or flow | Regenerate test step |
| `backend-bug` | Server endpoint returns unexpected data | Report only (no auto-fix) |
| `environment` | Timing, auth, or infrastructure issue | Adjust wait/retry |

### 3. Controlled Fix Modes

**Config-Only** (safe, default):
- Only modifies module configuration JSON files
- Never touches test source code
- Ideal for selector, URL, and field name corrections

**Config-and-Source** (advanced):
- Can also modify generated test files
- Used when test logic needs adjustment
- Changes are always minimal and targeted

### 4. Rollback Safety

Every fix includes:
- Automatic backup of original files
- Snapshot comparison after fix
- Automatic rollback if the fix makes things worse

## Configuration

```typescript
export default defineConfig({
  selfHealing: {
    enabled: true,
    maxIterations: 3,
    mode: 'config-only',  // or 'config-and-source'
  },
});
```

## CLI Usage

```bash
# Run healing on all failed tests
npx opencroc heal

# Heal a specific module
npx opencroc heal --module user-management

# Set max iterations
npx opencroc heal --max-iterations 5
```
