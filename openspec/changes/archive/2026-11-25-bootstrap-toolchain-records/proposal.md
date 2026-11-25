# Proposal

## Why

Local development resolves Node, pnpm and Chromium from whatever is on `PATH` or under each worktree's own `.cache`, so the pre-push verification and the lab can run with a pnpm version the target DSH runtime was never tested with, and two worktrees can use different tools. The target DSH release declares its pnpm version only in its source tree (`packageManager: pnpm@11.28.5` at tag `dsh-v0.2.2-rc.2`), while this repository pins 12.6.0 and keeps no record of what bootstrap chose.

## What Changes

- Pin pnpm to `11.28.5`, the version the target DSH release declares, in one toolchain constant; no `packageManager` field and no pnpm devDependency.
- Prepare bootstrap-managed tools into shared version-keyed buckets under the worktree shared root: Node when it is downloaded, pnpm always, Chromium keyed by Playwright version. Each bucket carries a completion marker and a per-bucket install lock; an explicit `PLAYWRIGHT_BROWSERS_PATH` still wins.
- Write a per-worktree toolchain record under `<worktree>/.cache/toolchain/manifest.json` that names the resolved Node, npm, pnpm and Chromium paths plus the inputs it was written for. A worktree never uses another worktree's record to select tools; bucket collection is the only cross-worktree reader.
- Add `--deps-only` to bootstrap: resolve the shared root and Node, prepare the pnpm bucket, run `npm ci` when needed, reuse or install the Chromium bucket, write the record, then attempt bucket GC. It skips hooks, the lab doctor and tests; a collection abort is reported without failing the preparation.
- Run GC inside bootstrap with a reference scan over every worktree's record; delete unreferenced buckets by default after a one-hour grace period, and abort without deleting on a corrupt record.
- Run `--deps-only` when the plugin creates an apply worktree, after `git worktree add` and before the creation publishes its state; a failure uses the existing rollback and leaves no worktree, branch or state.
- Make the lab's pnpm check, browser check and plugin installation, and the pre-push hook's Node selection, use the current worktree's record. Without a record they keep the `PATH` behaviour and verify the pinned version; a stale record is refused with its correction.
- Keep CI's `pnpm/action-setup` at the same pin and bind the workflow, `docs/lab.md` and the constant in one test.
- Add the target release's declared pnpm version to the DSH upgrade procedure as a fact to record, an edit to make and a verification step.
- **BREAKING** the local pnpm moves from 12.6.0 to 11.28.5, and tools in a bootstrapped worktree now come from the record and shared buckets instead of the host `PATH`.

## Capabilities

### New Capabilities

- `toolchain-management`: owns the per-worktree record, the shared version buckets, the deps-only preparation, the consumer resolution rules and bucket GC; it reads the pnpm pin from `project-invariants`.

### Modified Capabilities

- `project-invariants`: adds the pnpm pin and its DSH-target source as a shared value.
- `development-workflow`: the DSH upgrade procedure must record and move the target release's declared pnpm version.
- `lab-harness`: the doctor resolves pnpm from the record when one exists and names bootstrap, not a global install, as the correction.
- `contributor-workflow`: the CI lab job's pnpm pin equals the repository pin.
- `apply-worktree`: creating an apply worktree prepares its toolchain record and rolls back on failure.
- `apply-worktree-environment`: Chromium moves to a Playwright-version bucket with a per-bucket lock, the record's browser path is consumed, and an explicit `PLAYWRIGHT_BROWSERS_PATH` still wins.

## Impact

- `lib/toolchain-record.js` (new, packaged), `scripts/toolchain.mjs` (new, re-exports it), `scripts/bootstrap.sh`, `scripts/bootstrap.mjs`, `scripts/activate.sh`, `scripts/worktree-env.mjs`, `scripts/lab/core/doctor.mjs`, `scripts/lab/core/install.mjs`, `scripts/lab/core/paths.mjs`, `scripts/lab/index.mjs`, `lib/worktree/create.js`, `lib/tools/apply.js`, `.githooks/pre-push`.
- `.github/workflows/ci.yml` pnpm pin, `test/ci-workflow.test.mjs`, `test/lab-doctor.test.mjs`, `test/lab-paths.test.mjs`, `test/lab-env.test.mjs`, `test/lab-doc.test.mjs`, `test/lab-install.test.mjs`, `test/worktree-env.test.mjs`, `test/worktree-create.test.mjs`, `test/bootstrap.test.mjs`, `test/hooks.test.mjs`, `test/bundle.test.mjs`, new toolchain tests.
- `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/lab.md`, `docs/apply-worktree-dev.md`, `docs/upgrading-dsh-runtime.md`.
- `test/bundle.test.mjs` or the packaging check covers the new packaged module.
- Runtime data stays under the ignored `.cache`: one record per worktree and version buckets under the shared root. No tracked file, dependency, `package-lock.json`, coverage baseline or `dist/` change.
- First creation of a worktree may install the pnpm and Chromium buckets; later worktrees of the same versions reuse them.
