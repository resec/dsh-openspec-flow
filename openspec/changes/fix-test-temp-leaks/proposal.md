# Isolate and remove test temporary directories

## Why

The test suite creates directories under the host temporary directory and most of them are never removed. On 2026-11-25 the top level held 13,808 entries and grew to 14,802 while a single verification window ran: `coverage-stamp-*` alone had 7,163 directories at about 370 KB each (a throwaway git repository per fixture, roughly 2.6 GB), `openspec-hook-*` had 5,160 at 54.5 MB, `dsh-pr-review-land-*` gained 658 directories and 215 MB between 00:11 and 00:21, and `dsh-cards-endpoint-*` had 185. The 40 GB host reached 170 MB free and the first verify failed with `ENOSPC`; that failure amplified the leak, because most test files delete their fixture only at the end of a passing test body, so every assertion failure skipped it.

Two separate defects produce this: runs have no isolated temporary root and no cleanup on failure, and one fixture removes a child directory instead of the root it created. Neither is visible to a passing run, and no test asserts that a file leaves the temp directory empty.

## What Changes

- The plain and scoped test entrypoints create one temporary root per run under the canonical host temporary directory, pass it as `TMPDIR` to the test process, and remove it when the run ends: on success, on a failing test, and on `SIGINT`/`SIGTERM`. `DSH_TEST_KEEP_TMP=1` keeps the root and prints its path for debugging. The coverage entrypoint inherits this through the runner it starts and needs no change.
- A shared test registry, `test/temp.mjs`, registers fixture roots in the files this change converts, so their teardown removes every registered root on any path, including a root a fixture creates before its test body's cleanup can run. Files outside the converted set keep their current cleanup and are bounded by the run root when the file runs through an entrypoint. A file that already removes every root it creates keeps its own cleanup; existing `cleanup(...)` calls stay, because a recursive force delete is idempotent.
- The cards endpoint fixture registers its root and removes that root rather than the `openspec/.review` subdirectory, so the empty shell no longer survives every test and a fixture failure cannot leave it behind.
- Every test file whose run leaves a fixture root behind is converted, not a fixed list: the known set is the eleven files that create roots with no teardown, plus `test/worktree-land.test.mjs` (three roots that survive even a passing run), fixture-created roots in `test/local-pr-retarget.test.mjs` and `test/inproc-cli.test.mjs`, and the cards endpoint file. A probe over every `test/*.test.mjs` with a fresh `TMPDIR` decides the final set. Production code, the plugin tool surface, dependencies and the bundle are unchanged.
- The entrypoint environment paragraph in `README.md` gains the per-run `TMPDIR` and the keep switch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the temporary-path rule now passes a per-run root instead of the host temporary directory itself, and two requirements are added: a run removes its temporary root, and a test file removes its temporary fixtures at teardown.

## Impact

- `scripts/test-env.mjs`, `scripts/run-tests.mjs`, `scripts/affected-tests.mjs`: run-root creation and removal.
- New `test/temp.mjs`, new `test/run-temp.test.mjs`, new `test/temp.test.mjs`, new `test/run-root-lifecycle.test.mjs`; `test/affected-tests.test.mjs` gains the environment assertion.
- `test/coverage-stamp.test.mjs`, `test/hooks.test.mjs`, `test/pr-review-land.test.mjs`, `test/check-pre-push.test.mjs`, `test/review-seal.test.mjs`, `test/pr-publish.test.mjs`, `test/pr-local-land.test.mjs`, `test/push-landed.test.mjs`, `test/pr-review-lock.test.mjs`, `test/pr-review-owner-review.test.mjs`, `test/pr-review-watch.test.mjs`, `test/worktree-land.test.mjs`, `test/local-pr-retarget.test.mjs`, `test/inproc-cli.test.mjs`, `test/lab-profile-init.test.mjs`, `test/review-cards-endpoint.test.mjs`.
- `README.md`: the test-entrypoint environment paragraph documents the per-run `TMPDIR` and `DSH_TEST_KEEP_TMP`.
- No plugin runtime, tool schema, configuration, dependency or data change; no bundle repack.
