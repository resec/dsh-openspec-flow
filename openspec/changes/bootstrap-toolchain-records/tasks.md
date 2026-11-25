# Tasks

## 1. Toolchain module and pin

- [ ] 1.1 Add `lib/toolchain-record.js` with the record schema, atomic read/write, input fingerprint, staleness classification and per-worktree resolution, using only Node built-ins. Verify the module imports with `node -e "import('./lib/toolchain-record.js')"`.
- [ ] 1.2 Add `scripts/toolchain.mjs` with `PNPM_VERSION = '11.28.5'`, the bucket path helpers and re-exports of the record helpers; add `test/toolchain.test.mjs` cases for a record round-trip, a changed lock or pin making it stale, a changed platform, one worktree not selecting tools from another's record, and the bucket path keys. Verify `node --test test/toolchain.test.mjs` passes.
- [ ] 1.3 Add a packaging assertion that the published tarball carries `lib/toolchain-record.js` and no record helper sits under `scripts/`. Verify `node --test test/bundle.test.mjs` passes.
- [ ] 1.4 Move `PNPM_VERSION` out of `scripts/lab/core/doctor.mjs` into `scripts/toolchain.mjs`, keep the doctor importing and re-exporting it, and set it to `11.28.5`; update the test imports if they move. Verify `node --test test/lab-doctor.test.mjs` passes with the new value.
- [ ] 1.5 Update `.github/workflows/ci.yml`, `docs/lab.md`, `CONTRIBUTING.md` and `README.md` to the pin, and add the target tag's root `packageManager` check to `docs/upgrading-dsh-runtime.md` (target facts, ordered edits, test matrix, acceptance checklist). Verify `node --test test/ci-workflow.test.mjs` passes and the playbook names the pin check.

## 2. Buckets and deps-only preparation

- [ ] 2.1 Resolve the shared root in `scripts/bootstrap.sh` from `OPENSPEC_FLOW_SHARED_ROOT` or the main worktree, matching `scripts/worktree-env.mjs`; keep the per-worktree fallback when no git worktree exists. Verify `test/bootstrap.test.mjs` compares the shell and Node resolutions.
- [ ] 2.2 Prepare a downloaded Node runtime into `<shared>/toolchain/node/<version>/` with the tarball, checksums, a per-bucket lock and a completion marker; keep a host runtime unbucketed and record it with a host source. Verify `test/bootstrap.test.mjs` covers host and downloaded cases.
- [ ] 2.3 Prepare the pnpm bucket at `<shared>/toolchain/pnpm/<version>/` with the resolved Node's npm and the shared npm cache, write the marker only after `pnpm.mjs --version` equals the pin, and reuse a complete bucket. Verify `test/bootstrap.test.mjs` covers first install, reuse, a partial bucket and a version mismatch.
- [ ] 2.4 Prepare the Chromium bucket at `<shared>/browsers/playwright-<version>/` with the local `playwright/cli.js`, a lock scoped to that bucket, and a marker recording the Chromium, headless-shell and ffmpeg revisions; make `--reset-browsers` reset only that bucket and keep an explicit `PLAYWRIGHT_BROWSERS_PATH` authoritative. Verify `test/bootstrap.test.mjs` covers the key, the marker, the explicit override and the reset scope.
- [ ] 2.5 Make `scripts/worktree-env.mjs` resolve the Playwright version from the lockfile or an installed `playwright-core`, export that bucket path as `PLAYWRIGHT_BROWSERS_PATH` when no explicit value is set, and make `init --browser` and `check` use the same bucket and per-bucket lock. Verify `test/worktree-env.test.mjs` covers the exported path, the explicit override, the per-bucket lock and the missing-version failure.
- [ ] 2.6 Write the per-worktree record at `<worktree>/.cache/toolchain/manifest.json` only after every preparation step succeeds, with the resolved paths, versions, buckets, inputs, requirements and platform. Verify `test/bootstrap.test.mjs` reads the fields and a failed preparation leaves no record.
- [ ] 2.7 Make `scripts/activate.sh` read the record's Node path first and fall back to the legacy `<worktree>/.cache/toolchain/node` symlink only when no record exists. Verify `test/bootstrap.test.mjs` covers the record-driven path and the fallback.
- [ ] 2.8 Add the `--deps-only` plan to `scripts/bootstrap.sh` and `scripts/bootstrap.mjs`: resolve the shared root and Node, prepare the pnpm bucket, run `npm ci` only when `node_modules` is absent, prepare Chromium, write the record, then attempt collection; skip hooks, the lab doctor and tests, and leave the full sequence unchanged. Verify `test/bootstrap.test.mjs` observes the skipped steps and the second run reusing everything.
- [ ] 2.9 Document `--deps-only`, the bucket layout, the record, the activation path and the browser bucket/lock/record defaults in `README.md`, `docs/lab.md`, `CONTRIBUTING.md` and `docs/apply-worktree-dev.md` (the shared table, the lock paragraph and the browser default); verify the documented commands run as written and `test/lab-doc.test.mjs` passes.

## 3. Consumers use the record

- [ ] 3.1 Make `scripts/lab/core/doctor.mjs` resolve pnpm from the current worktree's current record when it exists, run the bucket entry with the recorded Node, require the pin, check the recorded Chromium path when no explicit browser path is set, and report a stale record or a missing recorded path with its correction; without a record keep `PATH` and the pin check. Verify `test/lab-doctor.test.mjs` covers both paths, the stale record, the missing recorded path and the missing-browser correction naming the resolved path.
- [ ] 3.2 Make `scripts/lab/core/paths.mjs` and `scripts/lab/index.mjs` resolve the browser path for the lab run environment and the doctor: an explicit `PLAYWRIGHT_BROWSERS_PATH` wins, a current record's browser path comes next, and the Playwright-version bucket is the default; update `test/lab-paths.test.mjs` and `test/lab-env.test.mjs` for the new default. Verify `node --test test/lab-paths.test.mjs test/lab-env.test.mjs` passes.
- [ ] 3.3 Make `scripts/lab/core/install.mjs` prepend the recorded bucket `binDir` and Node directory to the `dsh plugin add` child `PATH`, leave the environment unchanged without a record, and refuse a stale record with its correction. Verify `test/lab-install.test.mjs` inspects the child environment for both record states.
- [ ] 3.4 Make `.githooks/pre-push` prepend the current worktree's recorded Node directory before validation and verification, keep `PATH` unchanged without a record, and fail on a stale record with its correction. Verify `test/hooks.test.mjs` covers a recorded Node, the no-record fallback and the stale record.
- [ ] 3.5 Update `AGENTS.md`, `CONTRIBUTING.md`, `docs/lab.md` and `docs/apply-worktree-dev.md` for the record lookup, the stale refusal, the no-record fallback, the pnpm source and the browser bucket; verify `test/lab-doc.test.mjs` and the remaining documentation tests pass.

## 4. Bucket collection

- [ ] 4.1 Implement collection in the bootstrap flow after the record write: enumerate every git worktree, read each record, collect referenced bucket paths, and delete only unreferenced, unlocked buckets older than one hour; abort without deleting on a corrupt record, report a missing worktree directory, leave the triggering preparation successful on an abort, and support `--no-gc` and `--gc-dry-run`. Verify `test/toolchain.test.mjs` and `test/bootstrap.test.mjs` cover keep, delete, locked, young, corrupt, dry-run and the successful preparation.
- [ ] 4.2 Document the collection rules and flags in `README.md` and `docs/lab.md`; verify the documented flags run as written.

## 5. Apply worktree creation preparation

- [ ] 5.1 Add the injectable `prepareEnvironment` seam to `createOrReuseApplyWorktree`, with the real implementation spawning `<worktree>/scripts/bootstrap.sh --deps-only` after the session move and before the state write; a failure uses the existing rollback and leaves no state. Verify `test/worktree-create.test.mjs` covers success, failure and the absence of a state file.
- [ ] 5.2 On reuse, validate the record through the packaged `lib/toolchain-record.js` and prepare only when it is missing or stale. Verify `test/worktree-create.test.mjs` covers a valid record skipping the preparation and a stale record preparing.
- [ ] 5.3 Document the automatic preparation, the rollback, the collection non-failure and the pre-change-branch failure in `docs/apply-worktree-dev.md` and `AGENTS.md`; verify the documentation tests pass.

## 6. Integration verification

- [ ] 6.1 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict.
- [ ] 6.2 Run `npm run lab -- doctor` and `npm run test:lab -- --mock-only` in a prepared worktree and confirm the lab uses the recorded pnpm and browser path.
- [ ] 6.3 Run `npm run openspec:check` and `openspec_inspect` with `action: "validate"` and `strict: true`; confirm both pass.
- [ ] 6.4 Create a scratch apply worktree, confirm its record and bucket reuse, then remove it; confirm collection keeps referenced buckets and that a second worktree reuses the same pnpm and Chromium buckets.

## Workflow follow-up

- Commit the implementation and run the apply review before archive.
- Land the change and push the archive commit, or record the offline land when GitHub is unreachable.
- Archive only on the user's request.
