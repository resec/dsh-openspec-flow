# Design: Speed up test execution

See [proposal.md](proposal.md) for the motivation and measured baseline.

## Context

The fake Host context in `test/fake-context.mjs` is the single injection point for CLI calls: every tool reaches the bundled `@fission-ai/openspec` CLI through `ctx.subprocess.spawn`. The three entrypoints (`scripts/run-tests.mjs`, `scripts/coverage.mjs`, `scripts/affected-tests.mjs`) all start `node --test`, so a change at that layer reaches plain runs, verification and affected runs at once.

The CLI package exposes only `"."` (`runCli` plus core helpers); the command functions (`statusCommand`, `ValidateCommand`, `applyInstructionsCommand`) live on unexported paths and print their JSON instead of returning it. The real CLI therefore has to stay the behavior source.

## Goals / Non-Goals

**Goals**

- Full suite at or below 25 s and `npm run verify` at or below 40 s on Node 24.22.2 with 4 cores.
- Keep the real bundled CLI as the behavior source and keep a real child-process contract test.
- One concurrency policy shared by the plain, coverage and affected entrypoints.

**Non-Goals**

- Calling CLI command functions directly: that needs unexported paths and a reimplementation of the CLI's failure JSON.
- Changing plugin runtime code, tool schemas, the coverage baseline or the pinned CLI version.
- Splitting the long review files again: measured at 21.7 s to 19.4 s, while `test/affected-tests.test.mjs` asserts exact file names.

## Decisions

### Run the CLI in-process behind the existing spawn contract

Add `test/inproc-cli.mjs` with a spawner that returns the same handle shape as the fake context (`done`, `collected`, `terminate`, `waitForExit`). It resolves the CLI with a dynamic `import()` inside the serialized queue on first call, so a suite that never runs in-process (or stays on `process`) does not load the CLI bundle; it then calls `runCli(argv)` and serializes calls through a queue so two runs never share `process.cwd` or captured output. The spawn argv is forwarded whole (`[process.execPath, cliPath, ...args]`): commander drops the first two slots, so passing only the command arguments would run an empty command.

It captures `console.*` rather than `process.stdout.write`: Node's test runner uses the latter for its child protocol, and the CLI writes JSON through `console.log`. It records both exit paths: a replaced `process.exit(code)` and a `process.exitCode` assignment that merely returns (the CLI's common failure path, for example `ValidateCommand` setting 1 and returning). The call result takes the explicit exit code first, then the observed `process.exitCode`; the snapshot is restored in the same `finally` block as `cwd` and the `CI`/`NO_COLOR`/`FORCE_COLOR` variables.

The fake context keeps `stats.spawns` as the total call counter (existing suites assert on it) and adds `stats.inprocCalls` and `stats.childProcesses` alongside it, incremented inside the selected branch, so a suite can assert `childProcesses === 0` without patching `node:child_process`.

It resolves after the output has been quiet for 25 ms (2 s grace when the command never writes, 30 s deadline).

Alternatives rejected: a worker thread still needs serialized output and adds startup cost; calling the command functions directly drops the CLI failure JSON; a patched `console` around the test runner cannot separate runner output from CLI output.

### Default to the in-process runner

`createFakeContext` takes `spawnMode: 'process' | 'inproc'`, defaulting to `inproc`. The default applies to every suite that builds a fake context, including CLI-backed non-review suites such as `test/inspect.test.mjs`, so the Impact list names them; `integration` and `e2e` pass `process` explicitly to keep the real child-process path, and the contract test uses `process`. An explicit argument is preferred over an environment variable because a forgotten variable must not silently change how a suite runs.

### Default test-file concurrency 8

Measured on 4 cores: 4 → 108.3 s, 6 → 100.2 s, 8 → 100.2 s, 12 → 101.7 s in the child-process mode; in the in-process mode, 8 reaches 21.7 s against 35.0 s at the default. A fixed default of 8 is simple and reproducible. The plain entrypoint accepts `--test-concurrency=<n>` after `--` as its override and adds its own `--test-concurrency=8` only when the passthrough carries no concurrency flag, so exactly one flag reaches `node --test` and the override wins. `scripts/run-tests.mjs` exports a pure argument builder (and guards its CLI entry the way `scripts/affected-tests.mjs` does) so `test/run-tests.test.mjs` can assert the exact list without starting a suite. The coverage entrypoint forwards the same default; the affected-test selector appends the same default, and its exact-argv assertion in `test/affected-tests.test.mjs` is updated as the regression test.

### Keep the real child-process path covered

Add `test/spawn-contract.test.mjs`, which uses the `process` mode against the bundled CLI and asserts exit codes, aborts and output bounds. Add `test/inproc-cli.test.mjs` for the runner itself: queueing, a nonzero exit code, abort and the completion window.

## Risks / Trade-offs

- [Quiet-window completion can end a command early] → 25 ms quiet, 2 s no-output grace, 30 s deadline; the full suite and the contract test must pass.
- [Replacing `process.exit` and `process.exitCode` can leak a failure code into the test process] → the snapshot is restored in the same `finally` block; the runner unit test imitates `validate` (assign 1 and return) and asserts the reported code and the restored process code.
- [Captured console output can include test-runner output] → only `console.*` is captured; the runner protocol stays on `process.stdout.write`.
- [Serialization changes concurrency-sensitive timing] → the review-wait and card suites exercise concurrent calls and must pass.
- [Concurrency 8 overloads a small machine] → `-- --test-concurrency=<n>` overrides it and the README documents both the default and the override.

## Migration Plan

1. Add the in-process runner and its unit test.
2. Make `inproc` the fake-context default; pass `process` explicitly in `integration` and `e2e`; update the affected-tests argv assertion.
3. Add the spawn contract test.
4. Set the concurrency default in the three entrypoints.
5. Update the README test section and run the full suite plus `npm run verify`.

Rollback: delete `test/inproc-cli.mjs` and its tests, restore the `process` default (dropping the explicit modes in `integration` and `e2e`), and remove the concurrency defaults from the entrypoints.
