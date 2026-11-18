# Proposal: Speed up test execution

## Why

The suite grew from 530 to 771 cases across 65 files. On the primary Node 24.22.2 runtime with 4 cores, `npm test` now takes 108.3 s and `npm run verify` 147.9 s. The cost is almost entirely process startup: the fake Host context issues 1396 CLI calls, each spawning a Node process that spends most of its ~168 ms lifetime loading the bundled CLI, for 234.0 s of cumulative child-process time (99.5% of the sequential test CPU). Raising test-file concurrency alone only saves 7.5% (108.3 s to 100.2 s), so every change and every pre-push verification keeps paying for the same CLI startup.

## What Changes

- Add an in-process CLI runner in `test/inproc-cli.mjs` that executes the pinned bundled CLI through its `runCli` entrypoint: serialized calls, console output capture, exit codes taken from both `process.exit` and `process.exitCode` assignments (with the process code restored afterwards), abort handling, and a bounded completion wait. The fake Host context selects it through `spawnMode`, which defaults to the in-process runner for every suite that builds a fake context (including CLI-backed non-review suites such as `test/inspect.test.mjs`); `integration` and `e2e` pass `process` explicitly to keep the real child-process path.
- Switch the review suites to the in-process runner. `integration` and `e2e` keep the real child-process path, and a new contract test keeps covering real-spawn exit codes, aborts and output bounds.
- Add unit tests for the runner itself: queueing, error exit codes, abort and the quiet-window completion rule.
- Raise the default test-file concurrency to 8 in the plain test entrypoint, and pass the same default through the coverage entrypoint and the affected-test selector. The value is overridable for diagnostics.
- Update the README test section with the new mode, the concurrency default and the measured figures.
- Measured acceptance: full suite at or below 25 s and `npm run verify` at or below 40 s on Node 24.22.2 with 4 cores, every case passing, coverage gate green.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: review suites run the bundled CLI in-process by default while a dedicated contract test keeps the real child-process path; in-process calls preserve and restore exit codes; the plain, coverage and affected entrypoints share one bounded test-file concurrency of 8.

## Impact

- Tests: new `test/inproc-cli.mjs`, `test/inproc-cli.test.mjs`, `test/spawn-contract.test.mjs`; `test/fake-context.mjs`; review suite setup; `test/inspect.test.mjs` (a CLI-backed non-review suite that inherits the new default); `test/affected-tests.test.mjs` (the selector's exact argv assertion).
- Entrypoints: `scripts/run-tests.mjs`, `scripts/coverage.mjs`, `scripts/affected-tests.mjs`, plus a unit test for the runner defaults.
- Documentation: `README.md` test section.
- No plugin runtime code, tool schemas, dependency versions, coverage baseline or archived specs change. The coverage stamp fingerprint already covers `test/` and `scripts/run-tests.mjs`, the only coverage-run inputs this change edits; `scripts/affected-tests.mjs` is deliberately outside the stamp.
