# Remove the evaluation harness from the plugin repository

## Why

The evaluation harness now lives in `dsh-openspec-flow-eval`, which owns its spec, fixtures, tests and coverage gate. Keeping a second copy here duplicates maintenance, makes every plugin push run harness tests through `coverage:check`, and leaves docs pointing at paths that no longer belong to this repository.

## What Changes

- **BREAKING** Delete the `eval/` harness, including its library, tests, fixtures, patches and generated assets.
- Remove the `evaluation-harness` capability (14 requirements) from this repository; the capability now lives in `dsh-openspec-flow-eval`.
- Remove `test:eval`, `test:all` and `eval:*` from `package.json`; `npm test` stays the plugin suite.
- Narrow the test and coverage gates to the plugin scope: remove the eval scope from `scripts/run-tests.mjs` and `scripts/coverage-gate.mjs`, and drop the eval section from `coverage.baseline.json`.
- Remove eval entries from `.gitignore`.
- Point `README.md` and `AGENTS.md` at `dsh-openspec-flow-eval` instead of local `eval/` paths.
- Keep the `@fission-ai/openspec` runtime dependency and every plugin runtime behaviour unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `evaluation-harness`: all 14 requirements are removed. Reason: the harness and its contract moved to `dsh-openspec-flow-eval`. Migration: use that repository's `evaluation-harness` spec.

## Impact

- Removed: `eval/` (about 58 tracked files).
- Changed: `package.json`, `scripts/run-tests.mjs`, `scripts/coverage-gate.mjs`, `coverage.baseline.json`, `.gitignore`, `README.md`, `AGENTS.md`.
- Unchanged: `index.js`, `lib/`, `skills/`, `locale/`, `cordis.patch.yml`, `package.json` dependencies, and the shipped plugin bundle.
- Verification: `npm test`, `npm run coverage:check`, `openspec validate --strict`. No real-model call is made.
