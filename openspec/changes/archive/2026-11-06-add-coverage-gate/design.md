# Design: Add a coverage gate

## Context

See `proposal.md`. The repository declares `engines.node >=24.9.0` and pins DSH 0.2.2-rc.1, whose primary Node version is 24. On Node 24.22.2, `node --test test/` and `node --test eval/test/` fail because the directory is loaded as a module; explicit test files work. Current coverage on that runtime is 94.18/66.57/91.98 for the plugin and 94.41/78.71/93.91 for `eval/lib`, with `eval/run.mjs` absent from lcov.

## Goals / Non-Goals

**Goals**: one Node 24 precondition shared by tests and coverage; one test execution that can also produce lcov; a report-mode gate with a checked-in baseline; an enforce mode after the debt is closed.

**Non-Goals**: a CI workflow; a per-file coverage requirement; running the real-model evaluation; changing plugin runtime behavior.

## Decisions

### Decision: a test wrapper enumerates files instead of passing directories

Node 24 does not accept a directory for `--test`. The wrapper reads `test/*.test.mjs` and `eval/test/*.test.mjs`, sorts the paths, and passes explicit files. This avoids depending on Node 24 glob handling or shell expansion and keeps Windows behavior identical.

### Decision: one preflight module, no version manager

`scripts/node-version.mjs` reads `primaryNodeMajor` from `coverage.config.json` and the range from `package.json#engines.node`, then checks `process.version`. It never invokes fnm, nvm, volta, or searches their directories. The test wrapper and the coverage orchestrator call the same function, so tests and coverage cannot disagree.

### Decision: coverage is a switch on the test run

`COVERAGE=1` (or `--coverage`) adds the coverage reporter flags to the same `node --test` invocation that runs the tests. When unset, no coverage flags and no lcov are produced. The gate reads lcov and never spawns tests. The orchestrator sets the switch for its child run, so no shell-specific environment syntax is required.

### Decision: Node 24 flag order

Coverage flags are placed before test file paths. On Node 24, options after the first positional argument are treated as test arguments, so the wrapper owns the argument order.

### Decision: baseline records the concrete runtime and the range

`coverage.baseline.json` stores `node.version` (for example `v24.22.2`) and `node.range`. The gate accepts a different patch version when both current and baseline have major 24 and satisfy the current range; it rejects a baseline from another major or outside the current range. A patch difference is reported because V8 coverage can drift.

### Decision: zero-dependency parsers

The gate parses lcov and `git diff --unified=0` directly and implements the comparator subset used by `engines.node` (`>=`, `>`, `<=`, `<`, `=`, AND, `||`). Unsupported syntax fails closed instead of being ignored. Adding a semver dependency remains an option if the range syntax grows.

### Decision: report first, enforce later

The change lands in `report` mode with report-only exit behavior. After plugin and eval debt is closed, a dedicated task flips `mode` to `enforce` and installs the pre-push hook. Preflight, missing lcov, invalid baseline, and test failure stay nonzero in both modes.

## Risks / Trade-offs

- [Node patch drift changes V8 coverage] → Record the patch version, report the difference, and re-baseline after confirming no code regression.
- [Node 26 is the default shell runtime] → The preflight fails with an actionable message; the hook must be run with Node 24 active. Scripts never switch runtimes automatically.
- [`engines.node` claims 25/26 support] → The gate only evidences major 24. Document the gap and run focused compatibility checks separately when needed.
- [Local-only hook is bypassable] → Document `--no-verify`; add server-side enforcement only if requested.
- [Coverage instrumentation slows tests] → The slowdown is accepted to keep one test pass; coverage off remains the default for `npm test`.

## Migration Plan

1. Land the Node 24 test wrapper and preflight in report mode.
2. Add single-pass collection, baseline, and report gate.
3. Close plugin and eval coverage debt; make `eval/run.mjs` loadable by tests.
4. Flip to enforce, install the hook, and document the workflow.
5. Rollback: revert the enforce commit to report mode; revert the tooling commit to remove the gate; unset `core.hooksPath` if the hook was installed.

## Open Questions

None.
