# Tasks

## 1. Run-level temporary root

- [x] 1.1 Add `createRunTempDir` and `removeRunTempDir` to `scripts/test-env.mjs`: create the root under the canonical base, return `undefined` when the base cannot be resolved, and keep `testEnvFor` unchanged; add `test/run-temp.test.mjs` covering a root under the canonical base, two distinct roots, recursive removal, removal of a missing path, an explicit `TMPDIR` base and the unresolvable-base result; verify with `node --test test/run-temp.test.mjs` on Node 24
- [x] 1.2 Wire `scripts/run-tests.mjs`: create the root after the Node preflight, pass `TMPDIR` into `testEnvFor` for every scope, remove it in a `finally`, keep and report it for `DSH_TEST_KEEP_TMP=1`, and install `SIGINT`/`SIGTERM` handlers that remove the root and exit with 130/143; verify `probe=$(mktemp -d); TMPDIR="$probe" node scripts/run-tests.mjs plugin` leaves the probe empty, `probe=$(mktemp -d); TMPDIR="$probe" DSH_TEST_KEEP_TMP=1 node scripts/run-tests.mjs plugin` leaves exactly one `openspec-flow-run-*` in the probe, and a `SIGTERM` delivered to a running entrypoint removes the root and yields exit status 143
- [x] 1.3 Wire `scripts/affected-tests.mjs`: create the root only in the branch that spawns, remove it in a `finally`, and accept a caller-owned `tmpDir` that is used as `TMPDIR` and not removed; extend the fake-spawn case in `test/affected-tests.test.mjs` to pass `tmpDir` and assert `options.env.TMPDIR` equals it; verify `node --test test/affected-tests.test.mjs` passes, `probe=$(mktemp -d); TMPDIR="$probe" node scripts/affected-tests.mjs --run test/run-temp.test.mjs` leaves the probe empty, and `--list` creates no directory
- [x] 1.4 Document the per-run `TMPDIR` and `DSH_TEST_KEEP_TMP` in the `README.md` test-entrypoint paragraph; verify with `node --test test/contributor-docs.test.mjs` and by reading the paragraph against the implemented behavior

## 2. File-level fixture teardown

- [x] 2.1 Add `test/temp.mjs` exporting `tempDir(prefix)` and `cleanupTempDirs()`, and `test/temp.test.mjs` covering registration, distinct roots, batch removal and a second call that is a no-op; verify with `node --test test/temp.test.mjs`
- [x] 2.2 Convert `test/coverage-stamp.test.mjs`, `test/hooks.test.mjs` and `test/pr-review-land.test.mjs`: import the registry, register `test.after(cleanupTempDirs)`, and replace each uncovered `mkdtempSync(join(tmpdir(), ...))` with `tempDir(...)` while keeping existing `cleanup(...)` calls; verify each file passes and its probe run `probe=$(mktemp -d); TMPDIR="$probe" node --test <file>` leaves the probe empty (record the nonzero residue before the edit as the regression evidence)
- [x] 2.3 Convert `test/check-pre-push.test.mjs` and `test/review-seal.test.mjs` the same way; verify each file passes and its probe run leaves the probe empty
- [x] 2.4 Convert `test/pr-publish.test.mjs`, `test/pr-local-land.test.mjs`, `test/push-landed.test.mjs`, `test/pr-review-lock.test.mjs`, `test/pr-review-owner-review.test.mjs` and `test/pr-review-watch.test.mjs`; for `test/push-landed.test.mjs` create the sibling bare origin through `tempDir('dsh-push-landed-origin-')` so the teardown covers it; verify each file passes and its probe run leaves the probe empty
- [x] 2.5 Convert the three roots in `test/worktree-land.test.mjs` that are created through dynamic imports (`land-plain-*`, `remove-plain-*`, `worktree-tool-*`) to the registry; verify the file passes and its probe run leaves the probe empty
- [x] 2.6 Probe every `test/*.test.mjs` with a fresh `TMPDIR` and require an empty directory, then convert any file that still leaves residue; verify the loop ends with every probed file leaving an empty directory, and report the converted files that were not already listed
- [x] 2.7 Register fixture-created roots that can be lost before a test body's `finally`: convert the sibling origin in `test/local-pr-retarget.test.mjs` and the roots created before `cpSync` in `test/inproc-cli.test.mjs` to `tempDir`, then review every remaining fixture constructor that creates a root before its test body's `try` and convert the ones it creates; verify by inspection that each root is registered at creation and each file's probe stays empty

## 3. Cards fixture root

- [x] 3.1 In `test/review-cards-endpoint.test.mjs` create the fixture root through `tempDir('dsh-cards-endpoint-')`, register `test.after(cleanupTempDirs)`, and change the 37 `finally` blocks that remove `directory` to remove `root` (adding `root` to the destructuring); create the file's own inline roots (empty, legacy, legacy-withhold, shared and second-project) through `tempDir` as well while their `finally` blocks stay; verify `node --test test/review-cards-endpoint.test.mjs` passes and its probe run leaves the probe empty
- [x] 3.2 Review every touched test file for a directory that a fixture creates outside the root it registers, such as a bare origin or a lock directory, and confirm the teardown covers it; verify each file's probe remains empty and list the checked targets

## 4. Integration

- [x] 4.1 Run `probe=$(mktemp -d); TMPDIR="$probe" npm test` and then `probe=$(mktemp -d); TMPDIR="$probe" npm run verify` on Node 24; verify both pass, the coverage verdict passes and both probes are empty
- [x] 4.2 Run `node scripts/check-requirement-length.mjs` and OpenSpec strict validation for the change; verify both report no finding

## Workflow follow-up

- Commit the implementation, then run the apply review on the committed tree.
- Archive the change after the review requirements are satisfied; no bundle repack is required because the plugin runtime is unchanged.
