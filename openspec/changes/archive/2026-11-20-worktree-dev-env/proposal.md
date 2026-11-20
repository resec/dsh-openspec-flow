# Proposal: Repository-side worktree development environment

## Why

The plugin can create and land change-scoped apply worktrees, but the repository has no consistent way to run installs and tests inside them. Each new worktree would download its own npm and pnpm content, install its own Chromium, and risk sharing a DSH profile or test output with another worktree. Sharing `node_modules` directly is unsafe because `npm ci` deletes and rebuilds it, lockfiles can differ, and concurrent worktrees would corrupt each other.

The missing piece is a repository development environment: shared package and browser caches, per-worktree installs and DSH homes, and one documented command that exports the paths. It must stay outside the plugin's tool surface and state.

## What Changes

- Add `scripts/worktree-env.mjs` with `print`, `json`, `check` and `init` actions. It resolves the main worktree from any checkout, exports a shared cache root, npm and pnpm cache paths, a shared Chromium path, and a per-worktree `DSH_HOME`. It never reads or writes plugin state.
- Share the npm cache, pnpm store and Chromium binary directory under `<main>/.cache/openspec-flow/shared`; keep `node_modules`, test output and `DSH_HOME` per worktree. `init --browser` serializes the browser install with a shared lock.
- Make the lab and bootstrap honor `npm_config_cache`, `LAB_NPM_CACHE` and `PLAYWRIGHT_BROWSERS_PATH` instead of forcing their worktree-local defaults. Bootstrap resolves the browser path once and uses it for the presence check, reset and install; both bootstrap and `init --browser` prepare Chromium under one shared install lock with wait, recheck and stale-owner handling. The lab keeps its per-run `DSH_HOME`; lab ports stay OS-assigned (`--port 0`, `listen(0)`), so no port salt is added.
- Add `docs/apply-worktree-dev.md`, update `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md` and `README.md` with the environment contract, the resolved browser-path rules and the boundary between plugin behavior and repository tooling.
- Add regression tests for worktree resolution, exported paths, cache preparation, lab/bootstrap environment precedence and concurrent worktree preparation.

## Capabilities

### New Capabilities

- `apply-worktree-environment`: repository-side environment for running installs and tests in plugin-created apply worktrees, without changing plugin state or tool behavior.

### Modified Capabilities

- `contributor-workflow`: bootstrap resolves the Chromium path from `PLAYWRIGHT_BROWSERS_PATH` or the existing default, uses that resolved path for the presence check, `--reset-browsers` and the install, and allows the explicitly configured shared cache while keeping the default clone-local behavior.

## Impact

- New `scripts/worktree-env.mjs`; changes in `scripts/lab/core/paths.mjs`, `scripts/lab/index.mjs`, `scripts/lab/core/install.mjs` and `scripts/bootstrap.mjs`.
- New `test/worktree-env.test.mjs` and lab/bootstrap regression coverage; document assertions in the existing documentation test.
- New `docs/apply-worktree-dev.md`; updates to `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md`, `README.md` and the `contributor-workflow` delta.
- No plugin `lib/` changes, no new tool, no state field, no dependency and no push behavior.
