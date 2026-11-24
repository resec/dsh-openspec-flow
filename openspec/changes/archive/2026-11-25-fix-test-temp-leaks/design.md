# Design

## Context

See [proposal.md](proposal.md) for the measured leak and its cost.

Both test entrypoints spawn `node --test` with an environment from `testEnvFor(coverage, env)`: `run-tests.mjs` for the plain and coverage scopes, `affected-tests.mjs` for the scoped selection during apply. `testEnvFor` only resolves the inherited `TMPDIR` to its canonical path so a child process's reported `getcwd` matches the fixture path; it creates nothing and removes nothing. The coverage entrypoint starts `run-tests.mjs` as a child and inherits this behavior.

Most test files create fixture roots with `mkdtempSync(join(tmpdir(), prefix))` and delete them inline at the end of a passing test body, or through a `cleanup(...)` call inside a `finally`. The files this change converts are the ones whose run leaves a fixture root behind; at drafting they are eleven files with no teardown, `test/worktree-land.test.mjs` with three roots that survive a passing run, the cards endpoint file, and fixture constructors in `test/local-pr-retarget.test.mjs` and `test/inproc-cli.test.mjs` that create a root before the test body's `try`. `test/review-fixtures.mjs` already demonstrates the repository's teardown pattern: a module-level `CREATED` array plus `test.after(cleanupFixtures)` registered by each importing file.

## Goals / Non-Goals

Goals:

- Bound a whole run's temporary footprint to one directory that is removed at the end of the run.
- Make fixture removal independent of a test body reaching its last line, without touching every helper signature.
- Keep the change inside the test harness and test files: no production code, no configuration, no dependency.

Non-Goals:

- No sweep of historical `/tmp` debris, no scheduled cleanup, no CI step: the run root makes that unnecessary for the repository's own runs.
- No change to the repository `.cache` directories (`lab`, `pr-review`, `node-compile`), whose retention is intentional.
- No reformatting of test files beyond importing the registry, registering teardown, and replacing the creation expression.
- No change to `testEnvFor`'s canonicalization semantics or to the existing `test-env.test.mjs` assertions.

## Decisions

### Decision 1: one run root under the canonical host temporary directory

Each entrypoint creates `mkdtempSync(join(canonicalTempDir(env), 'openspec-flow-run-'))`, passes `{ ...process.env, TMPDIR: runRoot }` to the test process, and deletes the root in a `finally`. Helpers `createRunTempDir` and `removeRunTempDir` live in `scripts/test-env.mjs`, which both entrypoints already import, and `testEnvFor` keeps canonicalizing: the run root is already canonical, so it passes through unchanged and the symlink scenario stays true.

`createRunTempDir` returns `undefined` when the canonical base cannot be resolved, and the entrypoint then passes the inherited environment through and runs without a root, matching the existing "the run continues" behavior. A `mkdtempSync` failure on a resolved base (for example `ENOSPC` or `EACCES`) propagates and stops the run before any test starts, because a full or unwritable host is a condition the run must not hide.

Choosing the base as the canonical inherited `TMPDIR` keeps a deliberate caller choice (a larger disk, a CI scratch path) while still isolating each run. A root directly under `tmpdir()` would ignore that choice; a root per test file would multiply roots and still need the per-file teardown this change adds anyway.

The run root is removed on `SIGINT`/`SIGTERM` through handlers registered next to it. Installing a listener removes Node's default termination, so each handler removes the root and then exits with the conventional `128 + signal` status (130 for `SIGINT`, 143 for `SIGTERM`); otherwise a signal would be swallowed and the run would report its normal status. The entrypoints spawn the test process asynchronously: a blocking `spawnSync` defers the handler until after the child finishes, which would lose the documented exit status, so the handler forwards the signal to the active child, waits for its `exit`, and only then removes the root. The removal therefore never races a test still writing into the root, and the entrypoint's own exit status survives an interruption. `DSH_TEST_KEEP_TMP=1` keeps the root and prints the path for both entrypoints before the root would be removed, which is the debugging path for a failing suite; without it a failing run leaves no evidence directory behind, which is the intended trade-off.

The scoped entrypoint creates a root only in the branch that spawns, so `--list` keeps its promise to start no process and write nothing. Its `main` accepts an optional `tmpDir` that the caller owns: when present, `main` uses it as the child's `TMPDIR` and removes nothing, so the existing fake-spawn test can assert the environment without creating or deleting a real directory.

Alternatives rejected:

- Set `TMPDIR` to a fixed directory and clean it at the start of the next run: a crashed run's debris survives until the next run, and two concurrent runs would delete each other's fixtures.
- Rely on the operating system's temporary-directory cleanup: not guaranteed on Linux, and not before the disk fills.

### Decision 2: a file-level registry instead of per-test `t.after`

A new `test/temp.mjs` exports `tempDir(prefix)`, which creates the directory and records it in a module-level set, and `cleanupTempDirs()`, which force-deletes every recorded directory and clears the set. Each target file imports the pair, calls `test.after(cleanupTempDirs)` once near its imports, and replaces `mkdtempSync(join(tmpdir(), prefix))` with `tempDir(prefix)`.

Threading a `t` parameter into helpers was rejected: `pr-review-land.test.mjs` calls `makeRepo()` 61 times across 65 tests, and `pr-review-watch.test.mjs` builds its remote and binary directories from shared helpers, so per-test registration touches more call sites than it removes and adds a signature convention every future fixture must follow. The repository already uses `test.after(cleanupFixtures)` in twelve files, so the file-level hook is the established pattern.

The converted set is an observable property, not the eleven-file inventory: each `test/*.test.mjs` is run with a fresh `TMPDIR`, and the probe directory must be empty. The known uncovered set includes `test/worktree-land.test.mjs`, whose three roots (`land-plain-*`, `remove-plain-*`, `worktree-tool-*`) survive even a passing run because its dynamic imports bypass the review fixture registry; the apply-time probe over every test file adds any other offender before the change completes. A file that already removes every root it creates through its own `finally` or `cleanup(...)` keeps that code and needs no registry entry. Files outside the converted set keep their current cleanup: when such a file runs through an entrypoint, the run root bounds any leftover, while a single-file run can still leave one as before this change. The delta requirement therefore covers registered roots, not a root a file never registers. The apply-time probe ran every `test/*.test.mjs` with a fresh `TMPDIR` and an isolated compile cache; each probe directory ended empty, and the one converted file outside the drafted list was `test/lab-profile-init.test.mjs`, whose third test created a root with no teardown.

The passing-run probe cannot see a root that a fixture creates before the test body's `finally` and that the test removes on success. In a file this change converts, a root created before that `finally` is reachable is registered at creation, which is why the fixture constructors in `test/local-pr-retarget.test.mjs` (the sibling bare origin) and `test/inproc-cli.test.mjs` (the root created before `cpSync`) are converted even though their probes are empty.

The peak cost of file-level cleanup is bounded by one file's fixtures, measured at about 108 directories and 36 MB for `pr-review-land.test.mjs`; the other targets are smaller. The alternative, per-test registration, lowers that peak but does not change what survives a run, which the run root already bounds.

Existing `cleanup(...)` calls stay in place. `rmSync(..., { force: true })` on a path already gone is a no-op, so per-test cleanup and file teardown compose without ordering constraints.

`tempDir` records the directory the fixture created, not a descendant, and `cleanupTempDirs` deletes that recorded path recursively. That single rule fixes the cards-endpoint case as well: its tests currently remove the `openspec/.review` child and leave the root shell.

### Decision 3: delete the cards fixture root, not a shared teardown rewrite

`review-cards-endpoint.test.mjs` has 37 tests whose `finally` removes the `directory` returned by `fixture()`. They change to remove `root`, which the fixture already returns, and the fixture creates its root through `tempDir` so the file also registers `test.after(cleanupTempDirs)`. The two layers compose: the `finally` removes the root as soon as the test ends, and the teardown removes it again if a fixture throws before the test body's `try` begins. The file's own inline roots (the empty, legacy, shared and second-project roots) also go through `tempDir` for the same setup window, while their `finally` blocks stay. Deleting the `finally` blocks entirely was rejected: it saves a keyword per test but touches 44 test structures, making the diff harder to verify than the one-variable change this defect needs.

### Decision 4: cleanup failures warn without changing the result

Both layers treat removal as best-effort: a failure prints a diagnostic with the path and leaves the run's exit status untouched, because a cleanup failure must not turn a passing suite red or hide a failing one. The keep switch is checked after the tests finish, so an intentionally kept root is never reported as a failure.

### Decision 5: probe gates instead of a new test harness

Each target file is verified by running it with `TMPDIR` pointed at a fresh scratch directory and checking that the directory is empty afterwards; the same probe on the unmodified file records a nonzero residue first, so the evidence is a before-and-after pair. The full-run probe wraps `npm test` the same way. A meta-test that scans sources for missing teardown was rejected: its heuristics would flag helpers that legitimately create directories for a caller, and the probe already tests the observable property.

## Risks / Trade-offs

- [A killed run (SIGKILL) leaves one run root] → the root has a unique recognizable prefix, and the next run creates a new one; historical debris sweep stays out of scope.
- [File-level cleanup raises the peak within a file, and eight test files run concurrently] → one file's measured peak is about 108 directories and 36 MB; the run root bounds the whole run and is removed at its end.
- [A fixture creates a directory outside the root it registers, such as a sibling bare origin] → the conversion registers every directory the fixture creates; the passing-run probe covers only what survives a run, and task 2.7 reviews fixture constructors for roots created before the test body's `try`.
- [An inline root created before a test body's `try` in a file this change does not convert can still leak on a setup failure] → the requirement covers registered roots; through an entrypoint the run root bounds and removes it, while a single-file run can leave it as before this change.
- [A fixture whose directory must outlive its file] → none exists in the suite; the probe for each touched file would surface it.
- [The registry is global to a test process] → today `node --test` runs each file in its own process, and `cleanupTempDirs` clears the set, so a shared-process run still removes roots at the first file's teardown; no test relies on a root surviving a teardown.
- [Changing `test/` invalidates the coverage stamp] → the next `npm run verify` reruns the suite once, which is the intended gate.
- [Entrypoints now create a directory a read-only host may reject] → `mkdtempSync` fails with `EACCES` before any test starts, which is the same failure the fixtures would hit; no new silent path.
- [Signal removal relies on the child exiting after the forwarded signal] → the handler waits for the child's `exit` before removing the root, so a child that ignores the signal delays cleanup instead of racing it; a second signal after the single listener has fired is not handled, which SIGKILL already covers.

## Migration Plan

No data, configuration or dependency migration. The implementation commits are independent: the run root, the file-level registry and the cards fixture fix can be reverted on their own, and a later round adds the scoped keep switch and the lifecycle tests. Reverting the entrypoint change restores the previous blocking behavior without affecting the fixture teardown.

## Open Questions

None.
