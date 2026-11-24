# Tasks

## 1. Awaitable completion path

- [x] 1.1 Add a regression test whose fake CLI exposes `program.parseAsync`, logs, awaits a delay, then logs again; verify it fails against the current polling runner.
- [x] 1.2 Prefer `program.parseAsync` in `test/inproc-cli.mjs`; verify the delayed-command regression and the existing in-process tests pass on Node 24.
- [x] 1.3 Race the awaitable path against the configured deadline, add a stalled-entry test, and verify exit code 124 plus state restoration.
- [x] 1.4 Race the awaitable path against the abort signal, add an aborted-entry test, and verify rejection, queue release, the next call's output and state restoration.
- [x] 1.5 Add the exported `program` / `parseAsync` coupling-inventory row to `docs/upgrading-openspec-cli.md`; verify the row names the runner, both APIs and the fallback check.

## 2. Fallback and exit-code coverage

- [x] 2.1 Add a test proving a module without an awaitable program entry still calls `runCli` and completes through polling.
- [x] 2.2 Add awaitable-path tests for an explicit `process.exit` and a returning `process.exitCode`; verify the reported codes and restored test-process state.

## 3. Real CLI contract

- [x] 3.1 Add a test that asserts the pinned module exposes an awaitable entry, injects a loader whose `runCli` throws, and runs two commands through the shared real `program`; verify exit 0, both JSON payloads and isolated output.
- [x] 3.2 Run `node --test test/inproc-cli.test.mjs` with Node 24 active and verify the whole file passes.

## 4. Integration

- [x] 4.1 Run `npm run test:affected -- test/inproc-cli.mjs` with Node 24 active and verify the selected tests pass.
- [x] 4.2 Run `npm run verify` with Node 24 active and verify the test suite and coverage gate pass.
- [x] 4.3 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify it reports no findings.

## Workflow follow-up

- Run the draft review and fix every blocker before implementation.
- Apply the change, commit the implementation, and run the apply review.
- Land the worktree change, archive it, and push the landed commits to `origin/main`.
