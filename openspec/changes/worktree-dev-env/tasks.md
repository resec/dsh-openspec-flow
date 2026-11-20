# Tasks

## 1. Environment command

- [x] 1.1 Add `scripts/worktree-env.mjs` with `print`, `json`, `check` and `init` actions; verify `print` in the main worktree emits the shared root, npm cache, pnpm store, Chromium path and a `DSH_HOME` under the current worktree, and `json` returns the same values.
- [x] 1.2 Implement main-worktree resolution from `git worktree list --porcelain`, current-worktree resolution from `git rev-parse --show-toplevel`, and absolute `OPENSPEC_FLOW_SHARED_ROOT` override; verify main, linked and override cases in `test/worktree-env.test.mjs`.
- [x] 1.3 Reject a relative override or one containing NUL, CR or LF; verify the non-zero exit and message in `test/worktree-env.test.mjs`.
- [x] 1.4 Make `check` read-only and diagnostic: verify the shared root, cache directories, Chromium path, the computed `DSH_HOME`, an inherited `DSH_HOME` that differs from it, the observed pnpm version and any held install lock; verify it reports a missing browser without installing and names both homes on a mismatch.
- [x] 1.5 Make `init` create the shared directory layout and make `init --browser` and bootstrap use one lock helper with an owner record (token, pid, timestamp); a waiter SHALL poll with a timeout, recheck the browser and reuse it, a dead owner SHALL be reclaimed, and a live-owner timeout SHALL name the owner; verify the waiting-success, stale-owner and timeout paths in `test/worktree-env.test.mjs`.
- [x] 1.6 Assert the printed environment contains no `node_modules` path and no plugin-state path; verify the assertion in `test/worktree-env.test.mjs`.

## 2. Lab and bootstrap integration

- [x] 2.1 Make `scripts/lab/core/paths.mjs` expose resolvers taking the lab root and environment, with the npm cache from `LAB_NPM_CACHE` or `npm_config_cache` and the browser path from `PLAYWRIGHT_BROWSERS_PATH`, defaulting to `<root>/.cache/lab/pw-browsers`; make `scripts/lab/index.mjs` pass its own root and `scripts/lab/core/install.mjs` accept `npm_config_cache`; verify precedence, a custom root without the environment and the existing defaults in the lab cache tests.
- [x] 2.2 Make `scripts/bootstrap.mjs` resolve `PLAYWRIGHT_BROWSERS_PATH` once and enter the shared Chromium helper before the presence check, `--reset-browsers` and the installer, so the lock covers all three steps; verify the default path, the explicit shared path, the reset target and the lock coverage in the bootstrap tests.
- [x] 2.3 Keep the lab's per-run `DSH_HOME` and OS-assigned ports; verify the resolvers feed the shared npm and browser paths while the existing lab runner tests keep each run's home under its run directory and ports OS-assigned.
- [x] 2.4 Add a concurrent-preparation regression that runs `init --browser` and the bootstrap browser step against one shared root with separate worktree-local `node_modules`/output directories, including a `--reset-browsers` run while another preparation holds the lock; verify both succeed, the reset waits for the lock, the non-reset pair runs one installation total, the reset then removes the directory and runs its own sequential installation, and no shared `node_modules` appears.
- [x] 2.5 Update the `contributor-workflow` bootstrap tests and documentation assertions for the resolved browser path and the explicit shared path; verify `--reset-browsers` removes only the resolved directory and the default remains `.cache/lab/pw-browsers`.

## 3. Documentation

- [x] 3.1 Write `docs/apply-worktree-dev.md` with the `source <(node <main>/scripts/worktree-env.mjs print)` command, shared/per-worktree boundary, browser preparation and lock behavior, `--store-dir "$PNPM_STORE_DIR"` command, pre-existing-worktree instructions that use the main checkout's script without copying it into the worktree, `npm ci` before `init --browser`, concurrency rules, `DSH_HOME` isolation and rollback; verify every command in it runs as written from an apply worktree.
- [x] 3.2 Update `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md` and `README.md` to link the new document, state the `PLAYWRIGHT_BROWSERS_PATH` resolution order and keep `.cache/lab/pw-browsers` as the default; verify the links and the browser-path text with the documentation tests.

## 4. Integration

- [x] 4.1 Run `node scripts/worktree-env.mjs print` from a real apply worktree and verify the main root, shared root and per-worktree `DSH_HOME` values are correct.
- [x] 4.2 Run `npm run test:affected -- scripts/worktree-env.mjs scripts/lab/core/paths.mjs scripts/lab/index.mjs scripts/lab/core/install.mjs scripts/bootstrap.mjs` and fix every failure.
- [x] 4.3 Run `npm run openspec:check` and verify the active change and main specs validate.
- [x] 4.4 Run `npm run verify` on Node 24 and fix every failure.
- [x] 4.5 Make the coverage-stamp subprocess tests use `fileURLToPath` instead of `URL.pathname`, so a worktree directory containing `#` is not percent-encoded; verify `node --test test/coverage-stamp.test.mjs` passes in this worktree.

## Workflow follow-up

- Land the worktree change with `openspec_apply_worktree action=land` after apply review is ready and the user requests it; do not archive a worktree-applied change with `openspec_archive`.
- Push the merge and archive commits to `origin/main` after land.
