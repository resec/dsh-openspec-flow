# Add a coverage gate

## Why

The repository has no coverage gate, and its current test commands do not run on the declared Node floor: on Node 24, `node --test test/` treats the directory as a module and fails. Coverage must be collected during the same test run and compared with a recorded baseline so that plugin and eval coverage can be enforced without a second test pass.

## What Changes

- Add a shared Node 24 preflight for tests and coverage commands. The preflight requires major 24 and a concrete version satisfying `engines.node`; it never invokes fnm, nvm, or another version manager.
- Replace directory arguments with a test wrapper that enumerates test files explicitly and supports single-pass lcov collection through `COVERAGE=1`.
- Add a coverage gate for the plugin and eval scopes with overall floors, a delta guard, and new-code thresholds.
- Record the concrete Node version and `engines.node` range in the baseline; accept patch differences while requiring the primary major and range for both current and baseline versions.
- Start in report mode, then enable blocking after the existing coverage debt is closed.
- Keep the gate local: npm scripts, a checked-in baseline, and an optional pre-push hook. No CI workflow is added.

## Capabilities

### New Capabilities

- `coverage-gate`: Node-specific preflight, single-pass coverage collection, baseline, and coverage thresholds for plugin and eval code.

### Modified Capabilities

- `development-workflow`: verification uses the npm test entrypoints on Node 24 and includes the coverage check.

## Impact

- Affected files: `package.json`, new `scripts/` modules, `coverage.config.json`, `coverage.baseline.json`, `test/` and `eval/test/` tests, `README.md`, `AGENTS.md`.
- Later stages touch `eval/lib/**` and `eval/run.mjs` to close coverage debt; no plugin runtime behavior changes.
- `eval/run.mjs` becomes importable so its coverage is recorded without a real model call.
