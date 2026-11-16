# Design: scope apply test runs to the touched modules

## Context

See `proposal.md` for motivation. Measurements on this checkout, Node 24.22.2, 4 cores. Other sessions were running tests in parallel during the measurements, so parallel wall clocks varied between runs (77.3 s, 87.4 s and 90.5 s for the whole suite). Comparisons therefore use the additive per-file total, which does not depend on machine load.

Per-file wall time, one process per file, added up:

| Test file | Time |
| --- | --- |
| `test/review-apply.test.mjs` | 52.4 s |
| `test/review-wait.test.mjs` | 35.6 s |
| `test/review-draft.test.mjs` | 27.2 s |
| `test/review-serial.test.mjs` | 16.0 s |
| `test/integration.test.mjs` | 16.0 s |
| `test/review-reviewer.test.mjs` | 12.1 s |
| the other 30 files | 10.0 s |
| all 36 files | 169.3 s |

The six slow files are 159.3 s (94%) of that total. The 12 `test/review-*.test.mjs` files are 144.7 s (85%), so a directory split would keep almost all the work and is not a useful alternative. A scoped run of `test/review-unit.test.mjs` and `test/review-reviewer.test.mjs` is dominated by the second file, so its wall clock is about 10-12 s whatever the cache state.

Reverse import closure differs sharply by rule. Tracing imports through `index.js` selects 14 of the 36 test files for a change to `lib/review/brief.js`, because `test/review-fixtures.mjs` imports `../index.js`, eleven test files import `../index.js`, and `index.js` reaches every tool. Stopping at the assembly modules selects 2 files: `test/review-unit.test.mjs` (0.26 s) and `test/review-reviewer.test.mjs` (12.1 s). The same pattern holds for most modules: `lib/tools/review.js` selects 14 files through the entry and 1 behind the barrier; `lib/state.js` selects 18 and 5.

The flow's own history is separate: across the 55 sessions of the last three days the full suite ran 95 times for 69 minutes, a median of 50.9 s as recorded by `job/settled`, and `README.md` records about 40 s. Those come from other times and machines and are quoted as the cost being paid, not as a comparison baseline for this design.

## Goals / Non-Goals

Goals:

- A task batch runs the test files that import the changed module directly or through a helper, with entry-crossing tests excluded, so it does not pay for the six slow files when they are not involved.
- The rule is small, testable, and fails toward the full suite.

Non-Goals:

- Making a single test case faster, changing test concurrency, or tuning the compile cache; tracked separately.
- Changing the completion gate: `npm run verify` remains the single completion entry.
- Shipping the selector: it lives in `scripts/`, which `package.json`'s `files` list does not include, and the packaged skills are left unedited.

## Decisions

### Stop the import walk at the assembly modules

The selector walks `from '<relative>'` imports from each `test/*.test.mjs`, through local test helpers, and builds a reverse index. It does **not** expand the imports of `index.js`, `client.js`, `reviewer.js` or `lib/tools/index.js`: those files assemble the whole plugin, so expanding them makes every module reach every test that imports the entry, which is what the additive measurement shows.

Alternatives considered:

- **Follow every import** (`test/review-fixtures.mjs` → `index.js` → all tools): measured, a change to `lib/review/brief.js` then selects 14 files including the 52.4 s `review-apply` file, so a batch run is not shorter than the full suite.
- **Directory mapping** (`lib/review/**` → `test/review-*.test.mjs`): the 12 review files are 144.7 s of the 169.3 s additive total, so it keeps 85% of the work.
- **A hand-maintained module-to-test table**: no code, but it rots silently and nothing fails when it goes stale.

The barrier is a deliberate trade: a test that reaches a module only through the entry is not selected, so a batch can miss a cross-module regression. The end-of-apply full run is the guard, and the spec keeps `npm run verify` as the only completion gate.

### Treat entry modules as full-suite paths

A change to `index.js`, `client.js`, `reviewer.js` or `lib/tools/index.js` itself is not a module change inside the graph; it is a change to the assembly. Those paths select every test file. `reviewer.js` is included because it is a package entry imported by three test files, and its own imports reach the review tools. `package.json`, `.githooks/**`, `skills/**` and `openspec/**` are not listed: no test imports them, so they hit the empty-match fallback below.

### Fail loudly on an empty change set, and let `--all` bypass the tree read

The apply flow commits every round, so a clean working tree is a normal state, and a silent fallback would report a scoped run that is really the full suite. With no path arguments the selector reads `git status --porcelain` (taking the last path of a rename entry) and exits nonzero with a message when that set is empty. `--all` is checked first, reads no working tree, and never errors, so the escape hatch works on a clean checkout. Explicit paths are the documented primary form.

### Share the test environment with the full runner

`scripts/run-tests.mjs` already builds the child environment: it creates `.cache/node-compile` and exports `NODE_COMPILE_CACHE` for a plain run, deletes an inherited `NODE_COMPILE_CACHE` for a coverage run, and calls `assertCurrentNode()` before tests start. That construction moves into a shared `scripts/test-env.mjs` exporting `plainTestEnv()`, `coverageTestEnv()` and `testEnvFor(coverage)` (the coverage branch deletes the inherited value and creates no cache directory). `scripts/run-tests.mjs` calls `testEnvFor(coverage)` instead of its inline choice, so the coverage run keeps the main spec's non-caching behaviour, and a test pins `testEnvFor(true)` and `testEnvFor(false)` plus the preflight so the dispatch cannot drift silently.

### Keep the entrypoint testable without a failing test file

The CLI exposes `export async function main(argv, { version, spawn } = {})`. Tests inject a rejected `version` to assert the preflight stops before any test, and an injected `spawn` that returns a non-zero status to assert the exit status is forwarded. Neither check has to create a deliberately failing `*.test.mjs`, which would otherwise be enumerated by the next full run and break the gate.

### Option precedence

`--all` wins over everything and ignores the working tree. Otherwise `--list` prints the selection and starts nothing, and `--run` executes it; when both appear, `--list` wins so a listing is never a hidden test run.

## Risks / Trade-offs

- **A cross-module regression that only an entry-crossing test would catch** → the batch run can miss it. Mitigation: the full `npm run verify` run stays mandatory before completion; the spec scenario says a scoped run never stands in for it.
- **Static parsing limits** (multi-line imports, dynamic `import()`, files read with `readFileSync`) → a missed edge shows up as an empty match, which selects the full suite, not as a silent skip.
- **The graph changes under the selector** → a new test that imports a module directly starts being selected automatically; a test that stops importing it stops being selected. `test/affected-tests.test.mjs` pins the rules rather than the file lists.
- **Documentation overlap with in-flight changes** → `merge-verification-entry` owns the `npm run verify` wording and `reuse-coverage-stamp-on-push` owns the hook paragraph. This change adopts the current wording and touches the apply step only; the second landing reconciles the shared paragraphs.

## Migration Plan

No runtime migration and no data change. Reverting means deleting `scripts/affected-tests.mjs`, `scripts/test-env.mjs`, `test/affected-tests.test.mjs` and the `test:affected` npm script, restoring the inline child environment in `scripts/run-tests.mjs`, and reverting the two documentation paragraphs.

## Open Questions

None.
