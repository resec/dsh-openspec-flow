# Separate the evaluation tests from the daily test run

## Why

`npm test` currently runs every file under `test/`, including the nine evaluation-harness tests. Those tests need the repository's full history, POSIX `git`/`tar` and a prepared headless profile; everyday plugin work should not depend on that environment.

## What Changes

- Move the nine `test/eval-*.test.mjs` files to `eval/test/`.
- Keep `npm test` for plugin runtime tests only.
- Add `npm run test:eval` for the harness and `npm run test:all` for both suites.
- Update the verification guidance in `AGENTS.md`, `README.md` and `eval/README.md`.
- Correct the evaluation-harness spec's test command to `npm run test:eval` in the still-unarchived `add-model-e2e-eval` change.

## Capabilities

**New Capabilities**

- None. This is test and tooling organization; `skip_specs: true` records that no plugin behavior changes.

**Modified Capabilities**

- None.

## Impact

- Moved files: `test/eval-*.test.mjs` to `eval/test/`.
- Changed: `package.json` scripts, `AGENTS.md`, `README.md`, `eval/README.md`, and one scenario in the unarchived evaluation-harness delta.
- Not changed: plugin runtime code, shipped skills, eval harness behavior.
