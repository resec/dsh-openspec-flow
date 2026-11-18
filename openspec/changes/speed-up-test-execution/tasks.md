# Tasks

## 1. In-process runner

- [x] 1.1 Add `test/inproc-cli.test.mjs` covering the serialized queue, a nonzero exit code from `process.exit`, an exit code assigned through `process.exitCode` that returns without exiting, an aborted call and the quiet-window completion rule; verify it fails before `test/inproc-cli.mjs` exists.
- [x] 1.2 Implement `test/inproc-cli.mjs` with `createInprocSpawner`: the CLI resolved by a dynamic `import()` on first call, `runCli` called with the full spawn argv, `console.*` capture, explicit and assigned exit codes recorded with the `process.exitCode` snapshot restored, cwd and environment restore, an in-process call counter, and the 25 ms quiet window with a 2 s no-output grace and a 30 s deadline; verify the new unit test passes.

## 2. Fake context and review suites

- [x] 2.1 Add the explicit `spawnMode` option to `test/fake-context.mjs` (default `inproc`), keep `stats.spawns` as the total call counter, and add `stats.inprocCalls` / `stats.childProcesses` alongside it; verify `test/review-apply.test.mjs`, `test/review-wait.test.mjs` and `test/inspect.test.mjs` pass while `test/integration.test.mjs` and `test/e2e.test.mjs` pass `spawnMode: 'process'` and still pass, and put the durable counter assertions in `test/inproc-cli.test.mjs` (in-process: `childProcesses === 0`, `inprocCalls > 0`) and `test/spawn-contract.test.mjs` (process: `childProcesses > 0`).
- [x] 2.2 Add `test/spawn-contract.test.mjs` using `spawnMode: 'process'` against the bundled CLI, asserting a nonzero exit code, an abort and an output bound; verify it passes and starts a real child process.
- [x] 2.3 Run `npm test` with the review suites on `inproc` and verify the 771 existing cases plus any new runner and contract cases pass with no failures and the run stays at or below 25 s on Node 24.22.2 with 4 cores.

## 3. Entrypoint concurrency

- [x] 3.1 Add a default `--test-concurrency=8` to `scripts/run-tests.mjs` only when the `--` passthrough carries no concurrency flag, export a pure argv builder and guard the CLI entry, and add `test/run-tests.test.mjs` asserting the exact list carries exactly one `--test-concurrency` flag: 8 by default and the passthrough value when supplied; verify the new test passes, a run with `-- --test-concurrency=2` uses 2, and a plain run stays at or below 25 s with the in-process runner.
- [x] 3.2 Pass the same concurrency default through `scripts/coverage.mjs` to the test run it starts, and verify `npm run verify` stays at or below 40 s, passes the coverage gate and records no violations.
- [x] 3.3 Pass the same concurrency default through `scripts/affected-tests.mjs` and update the exact-argv assertion in `test/affected-tests.test.mjs` so it expects the concurrency; verify `npm run test:affected -- test/review-apply.test.mjs` runs the selected file with that concurrency and the selector's test passes.

## 4. Documentation

- [x] 4.1 Update the README test section with the execution modes, the concurrency default and its override, and the measured full-suite and verify figures; verify the documented commands run as written.
- [x] 4.2 Update any README claim that still states the old suite runtime, and verify no stale figure remains by searching the README for the old numbers.

## 5. Integration checks

- [x] 5.1 Run `npm test` on Node 24.22.2 and verify the 771 existing cases plus the new runner and contract cases pass with no failures, skipped or todo cases, at or below 25 s.
- [x] 5.2 Run `npm run verify` and verify the test summary and coverage verdict pass at or below 40 s with zero violations.
- [x] 5.3 Run `npm run openspec:check` and verify every active change, main spec and archived task check passes.
- [x] 5.4 Run `git status --porcelain` and `git diff --name-only`; verify only `test/inproc-cli.mjs`, `test/inproc-cli.test.mjs`, `test/spawn-contract.test.mjs`, `test/run-tests.test.mjs`, `test/affected-tests.test.mjs`, `test/integration.test.mjs`, `test/e2e.test.mjs`, `test/fake-context.mjs`, the review suite setup, `scripts/run-tests.mjs`, `scripts/coverage.mjs`, `scripts/affected-tests.mjs`, `README.md` and this change directory changed, and that `package.json` dependency fields, `coverage.baseline.json` and `dist/` are untouched.

## Workflow follow-up

- Archive the change after the apply review is ready and the user requests it.
