# Tasks

## 1. Node 24 test entrypoint

- [x] 1.1 Add `scripts/node-version.mjs` with the shared primary-major and `engines.node` checks plus unit tests; verify Node 24.22.2 passes, Node 26.12.0 fails, and Node 24.8.9 fails.
- [x] 1.2 Add `scripts/run-tests.mjs` that enumerates test files and update `package.json` test scripts; verify `npm test` runs 73 tests and `npm run test:eval` runs 62 tests on Node 24.
- [x] 1.3 Document the Node 24 precondition, the no-version-manager assumption, and the new entrypoints in `README.md` and `AGENTS.md`; verify the documented commands match `package.json`.

## 2. Single-pass coverage collection

- [x] 2.1 Add `COVERAGE=1` and `--coverage` support to `scripts/run-tests.mjs`, writing `.coverage/plugin.info` and `.coverage/eval.info`; verify one instrumented run prints one test summary and writes lcov without a second test process.
- [x] 2.2 Add `scripts/coverage.mjs` to run both suites once with coverage and invoke the gate; verify the gate reads lcov and never spawns tests.
- [x] 2.3 Add `.coverage/` to `.gitignore` and create `coverage.config.json` with `primaryNodeMajor`, thresholds, and report mode; verify generated artifacts are ignored and the config is tracked.

## 3. Gate and baseline

- [x] 3.1 Implement lcov parsing, added-line diff parsing, and scope aggregation in `scripts/coverage-gate.mjs`; verify unit tests cover lcov records, deletions, renames, and untracked files.
- [x] 3.2 Implement baseline reading, Node version/range validation, delta, and ratchet guard; verify a Node 24 baseline is accepted on another 24.x patch, a Node 26 baseline is rejected, and lowering requires an explicit override.
- [x] 3.3 Implement absolute floors, new-code thresholds, report/enforce exit behavior, and the report file; verify `npm run coverage` reports the current plugin and eval shortfalls and exits zero in report mode.
- [x] 3.4 Add gate boundary tests for 90/85/95, 95/90/100, a 1.00-point delta, missing lcov records, and report versus enforce; verify the tests pass under `npm test`.
- [x] 3.5 Record the initial baseline from the instrumented Node 24 run, including `eval/run.mjs` as missing; verify `npm run coverage` reports that missing record.

## 4. Plugin coverage debt

- [x] 4.1 Add tests for `lib/state.js` branch and function gaps; verify plugin branch reaches at least 85.00% and function reaches at least 95.00%.
- [x] 4.2 Add tests for `lib/openspec.js`, `lib/tools/write.js`, `lib/tools/query.js`, `lib/skill.js`, and `lib/policy.js`; verify plugin line is at least 90.00%, branch at least 85.00%, and function at least 95.00%, then raise the baseline.

## 5. Eval coverage debt

- [x] 5.1 Add tests for the remaining branches and functions in `eval/lib/matrix.mjs`, `eval/lib/config.mjs`, `eval/lib/session.mjs`, and `eval/lib/fixtures.mjs`; verify eval branch reaches at least 85.00% and function at least 95.00%.
- [x] 5.2 Make `eval/run.mjs` importable, add CLI tests for help, list, dry-run, and invalid arguments, and confirm no real model call; verify the eval scope has no missing-coverage record and meets 90/85/95.

## 6. Enforcement

- [x] 6.1 Flip `coverage.config.json` to `enforce`; verify a clean working tree passes `npm run coverage:check` and a deliberately uncovered new branch fails with its file and line.
- [x] 6.2 Add `.githooks/pre-push` and `scripts/install-hooks.mjs`; verify the hook blocks on a coverage violation on Node 24 and exits with the Node 24 preflight error on Node 26.

## 7. Integration verification

- [x] 7.1 Run `openspec validate add-coverage-gate`, `npm test`, `npm run test:eval`, and `npm run coverage:check` on Node 24; verify all pass with no second test invocation.

## Workflow follow-up

- Archive this change only when the user explicitly asks.
- After archive, commit the archive, docs, and merged specs together, then push to `origin/main`.
