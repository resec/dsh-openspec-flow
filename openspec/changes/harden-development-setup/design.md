# Design

## Context

See `proposal.md` for the failures. Three entrypoints build the child environment for tests: `scripts/run-tests.mjs` (plain and coverage), `scripts/affected-tests.mjs` (scoped apply aid) and `scripts/coverage.mjs` through `run-tests.mjs`. All three call `testEnvFor` in `scripts/test-env.mjs`, which today sets only `NODE_COMPILE_CACHE`. Every fixture uses `mkdtempSync(join(tmpdir(), ...))`, and the plugin spawns the bundled CLI with the fixture root as the child `cwd`; the CLI's root discovery reads `process.cwd()`, and POSIX `getcwd` resolves symlinks. On macOS the fixture root is `/var/folders/...` while the CLI reports `/private/var/...`.

`scripts/bootstrap.mjs` owns the step order: install, hooks, Chromium, doctor, tests, then full-mode verification and lab. `parseBootstrapArgs` is exported but no test imports it, and the module executes `main()` at load time without the entry-point guard `scripts/coverage.mjs`, `scripts/affected-tests.mjs` and `scripts/coverage-gate.mjs` use. Importing it from a test would run the bootstrap in the test process, so the change adds that guard before the helpers become test seams.

`CONTRIBUTING.md` documents the bootstrap options and the local checks but not the coverage thresholds, which live in `coverage.config.json` and are derived from `git merge-base origin/main HEAD`. `AGENTS.md` step 7 says to push `origin/main` without naming the maintainer.

## Goals / Non-Goals

### Goals

- A macOS checkout with the default `TMPDIR` passes the suite without a host-level workaround.
- A failed bootstrap step can be resumed without reinstalling dependencies or repeating the suite in full mode.
- The bootstrap helpers can be imported by a test process without running bootstrap or touching the network.
- The Chromium download host and a stale browser lock are recoverable from documented bootstrap options.
- The coverage gate and its report command are stated once in `CONTRIBUTING.md` and checked against the configuration.
- The `AGENTS.md` push step cannot be read as an external contributor instruction.

### Non-Goals

- Reordering the pnpm and font preflight before the Chromium download; the doctor still runs immediately after it.
- Adding a macOS CI job, changing the pre-push lab gate, or adding a lab stamp.
- Changing plugin runtime code, tool behavior, dependency versions, the coverage baseline or the lab harness.

## Decisions

### Decision: Canonicalize `TMPDIR` once in `testEnvFor`

Add a private `canonicalTempDir(env)` to `scripts/test-env.mjs` that resolves `env.TMPDIR ?? tmpdir()` with `realpathSync.native` and returns the input unchanged when resolution throws. `testEnvFor` adds the resolved value to the environment returned by `plainTestEnv` or `coverageTestEnv`. Child test processes then call `mkdtempSync(join(tmpdir(), ...))` with a canonical `TMPDIR`, so the fixture root and the CLI-reported root are byte-equal.

The seam is one function used by all three entrypoints, so the change cannot drift between plain, scoped and coverage runs. The alternative, replacing thirty `mkdtempSync` call sites with a `tempRoot()` helper, is a larger diff for the same observable behavior and leaves a future test free to bypass the helper. The second alternative, canonicalizing the root path inside the plugin, would change user-visible output to hide the path the user typed; the CLI reporting the canonical path is correct, so the tests should follow it.

`test/test-env.test.mjs` covers a symlinked `TMPDIR` (created by the test), an already canonical value and an unresolvable value. The symlink case runs on Linux CI, so the macOS behavior is exercised without a macOS runner.

### Decision: Add the entry-point guard and extract a pure bootstrap plan

Add the standard entry-point guard (`process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href`) around `main()` in `scripts/bootstrap.mjs`, matching `scripts/coverage.mjs`, `scripts/affected-tests.mjs` and `scripts/coverage-gate.mjs`, including their `process.argv[1]` null check so `node -e "import('./scripts/bootstrap.mjs')"` also skips the run. Tests then import `parseBootstrapArgs`, `resolvePlan`, `playwrightEnv`, `resetBrowsers`, `dependenciesError` and `completionHint` from the module without executing a step.

Alternatives considered: moving the helpers to `scripts/bootstrap-lib.mjs` (more churn and a second module to keep aligned) and leaving the module side-effecting (the test would run `npm ci`, Chromium and a nested suite). The guard is one line and follows the existing script convention.

`resolvePlan(options, state)` receives `{ browserPresent, dependenciesPresent }` and returns booleans for install, Chromium, doctor, plain test, verification and lab, plus `missingDependencies`. The Chromium rule is `!skipPlaywright && (resetBrowsers || !browserPresent)`: `--skip-playwright` always turns the step off, a reset always turns it on even when an executable exists, and an absent browser turns it on by default. `missingDependencies` refuses `--skip-install` without `node_modules`, and `dependenciesError()` returns the message naming `npm ci`, which `main` throws and the tests pin. `plainTest` is false when `--full` or `--skip-test` is set. `--reset-browsers` with `--skip-playwright` is rejected in argument parsing, before any directory is removed.

The state parameter keeps the plan pure and lets the tests pin reset, skip-test and skip-playwright without touching the filesystem. The full-mode rule is safe because `npm run verify` runs the same 65 files through `run-tests.mjs all`; the repository already states that a separate plain test pass is not required.

### Decision: Print the lab cache hint after a successful run

`completionHint()` returns a fixed sentence naming the DSH cache (`.cache/lab/dsh`) and `npm run lab -- cache prune`, and it only prints the command. `pruneCache` removes DSH entries older than 30 days under that directory and leaves `.cache/lab/pw-browsers` and `.cache/lab/cache` alone, so the hint is scoped to stale DSH installs; the browser cleanup stays `--reset-browsers`.

### Decision: Parse the labelled coverage table and bind it to the configuration

`test/contributor-docs.test.mjs` parses a two-row Markdown table in `CONTRIBUTING.md` — one row labelled `Absolute floor`, one labelled `New-code` — into line, branch and function values per row, and compares each cell with `coverage.config.json`; it also asserts the `1.00` point guard, `npm run verify` and `npm run coverage -- --report-only`. Six configured values collide (absolute line 90 equals new-code branch 90, absolute function 95 equals new-code line 95), so the parser keys on the row label and metric; a negative case relabels a row and expects a failure naming the row and metric.

The same file asserts `AGENTS.md` scopes the push step to the maintainer and stops external contributions at the pull request, and that the README publish order names the maintainer. `project-invariants` is modified to name `CONTRIBUTING.md` as the one allowed, test-bound snapshot of the floors: the capability stays the source, and a threshold change that forgets the document fails the test instead of drifting silently.

The test compares labelled cells and pins the qualifier phrases, so unrelated prose edits are safe while a mislabel, drift or removed qualifier fails. Hard-coding the numbers in the test would need the same edit in three places and could silently agree with a stale document.

## Risks / Trade-offs

- [The child `TMPDIR` override changes the environment a test observes] -> No test reads the raw value today; the new test covers the canonical, symlinked and unresolvable cases, and the override applies only to child test processes.
- [`--skip-install` runs against stale `node_modules`] -> The flag is opt-in, refuses a missing directory, and `npm run verify` still decides completion.
- [`--reset-browsers` deletes a usable browser cache] -> It is explicit, limited to the clone-local ignored directory, and refused together with `--skip-playwright`.
- [Full mode loses a fast test-only failure path] -> Verification still prints the test summary and fails before the coverage gate; the plain entrypoint remains available.
- [The documentation test is brittle against rewording] -> It parses labelled rows and compares cells, so prose edits are safe; a mislabel or drift fails with the row and metric.
- [A future test bypasses `testEnvFor`] -> The scoped and coverage entrypoints already share the helpers; a test that spawns a test process directly would still need a canonical `TMPDIR`, which the review notes as a residual risk.
- [The plan is correct but `main` wires the steps in a wrong order] -> The plan cases and the `--help` checks pin the option semantics; the first real full run remains the integration check, and the step log names each stage.
- [`CONTRIBUTING.md` becomes a second source of the coverage floors] -> `project-invariants` names it as the one allowed, test-bound snapshot, and the test fails on any drift.

## Migration Plan

Revert restores the previous `testEnvFor`, removes the new bootstrap options and the documentation test, and returns `CONTRIBUTING.md` and `AGENTS.md` to their previous text. No data, API or profile migration is involved.

## Open Questions

None.
