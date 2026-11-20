# Design: Repository-side worktree development environment

## Context

See `proposal.md` for motivation. The plugin already creates a per-change apply worktree, moves the session there, and keeps dependency caches, DSH profiles and ports out of its state (`docs/apply-worktree.md`). The repository's lab and bootstrap still default to worktree-local `.cache` paths, and there is no single place that answers where the shared caches and the current worktree's `DSH_HOME` are. This design adds that repository-side layer only.

## Goals / Non-Goals

**Goals**

- One command exports the shared cache paths, the current worktree's `DSH_HOME`, and the install-related paths.
- npm cache, pnpm store and Chromium are shared; `node_modules`, `DSH_HOME`, test output and coverage stay per worktree.
- The lab and bootstrap stop overriding explicitly exported cache/browser paths.
- Concurrent worktrees can prepare dependencies and run tests without sharing mutable directories or fixed ports.

**Non-Goals**

- No plugin `lib/` change, no new tool, no worktree state field, no push behavior.
- No shared `node_modules`; no port salt; no shared DSH profile.
- No automatic `source` into the user's shell and no automatic `npm ci` in the environment command.
- No change to the plugin's worktree lifecycle, locks or landed manifest.

## Decisions

### Share package caches, not node_modules

The environment exports a shared npm cache, a shared pnpm store and a shared Chromium directory, but never a shared `node_modules`. `npm ci` deletes and rebuilds `node_modules`; sharing it would let one worktree destroy another's dependencies. Different worktrees can also carry different lockfiles or Node versions. The package cache gives most of the download and disk benefit without those hazards. A future pnpm store hard-links packages into per-worktree `node_modules`, which keeps the same isolation with lower disk use.

### Exporting rather than auto-injecting

`scripts/worktree-env.mjs` prints shell exports and a JSON form. It does not modify the shell, write a profile or touch git configuration. The developer chooses to `source` it. This keeps the script safe to run in any worktree and easy to test; `check` is read-only and `init` only creates shared directories and optionally installs the browser.

### Main worktree resolution

The main worktree is the first `worktree ` entry from `git worktree list --porcelain`, matching the plugin and the `dsh-plugins` worktree tools. When the current checkout is the main worktree the entry is itself. A separate-git-dir layout that does not list a work tree is reported as unusable rather than guessed. The script uses `git rev-parse --show-toplevel` for the current worktree.

### Per-worktree DSH_HOME

`DSH_HOME` is always `<current worktree>/.cache/openspec-flow/dsh-home`. It is never derived from the shared root or the main worktree. The lab already creates a per-run home under its own run directory; that behavior stays. The environment therefore cannot accidentally point two worktrees at one profile.

### No port salt

The lab's DSH web server already uses `--port 0` and the mock provider uses `listen(0)`. OS-assigned ports are enough for concurrent runs. Adding a worktree-derived port salt would duplicate the OS and require coordination that the current harness does not need. The documentation states this; no code adds a port variable.

### Cache preparation and locking

`init` creates the shared root directories. Every Chromium preparation goes through one shared helper: `init --browser` and bootstrap's browser step both call it. The helper uses `<shared>/.install.lock`, a directory carrying an owner record with a token, pid and timestamp. The lock covers the presence check, `--reset-browsers` and the install, so a reset cannot remove a browser another worktree is installing. A waiter polls with a bounded timeout; when the holder finishes and the browser appears, the waiter rechecks and reuses it instead of failing. A timeout reports the owner. A lock whose recorded pid is dead is reclaimed by the next caller after re-reading the owner. `check` reports a held lock and its owner without removing it. npm and pnpm caches are safe for concurrent reads and are managed by those tools; no repository lock is added around them. The browser is installed once; later runs verify and reuse it.

### Lab and bootstrap precedence

`scripts/lab/core/paths.mjs` exposes resolvers that take the lab root and environment, such as `resolveBrowsersPath({ root, env })`, and falls back to `<root>/.cache/lab/pw-browsers` when `PLAYWRIGHT_BROWSERS_PATH` is unset. `scripts/lab/index.mjs` calls that resolver with its own `root`, so a custom-root lab without the environment keeps the existing custom-root default; `scripts/lab/core/install.mjs` accepts `npm_config_cache` as well as `LAB_NPM_CACHE`. `scripts/bootstrap.mjs` resolves `PLAYWRIGHT_BROWSERS_PATH` once, then enters the shared Chromium helper before the presence check, `--reset-browsers` and the installer, so the lock covers all three steps. `DSH_HOME` precedence stays with the lab's per-run home. This makes the environment opt-in and keeps a clean checkout working without it.

### Documentation split

`docs/apply-worktree.md` remains the plugin behavior document and continues to list dependency caches, DSH profiles and ports as non-goals. The new `docs/apply-worktree-dev.md` is the repository environment document. `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md` and `README.md` link to it and state the boundary and the resolved browser path, so plugin behavior and repository tooling are not mixed.

### pnpm store is explicit

pnpm does not reliably read `PNPM_STORE_DIR` on its own, so the environment exports the path and the documentation gives the explicit `--store-dir "$PNPM_STORE_DIR"` form. `check` reports the observed pnpm version so a developer can confirm the pinned tool. The JSON output also carries the store path.

## Risks / Trade-offs

- **A separate-git-dir layout may not name the main worktree** → the script fails with the git command and does not guess; the documented workaround is `git worktree repair`.
- **An exported cache path could be stale after a worktree move** → `check` verifies the paths and reports the current worktree; re-running `print` recomputes them.
- **A shared cache can hide a missing lockfile installation** → `node_modules` remains per worktree; the environment never substitutes a shared install.
- **pnpm may not read a store environment variable in every version** → the documentation gives the explicit `--store-dir "$PNPM_STORE_DIR"` form and `check` reports the pnpm version; the JSON output also exposes the path.
- **DSH_HOME in the wrong place can create a second profile** → `check` compares an inherited `DSH_HOME` with the computed worktree home and names both when they differ.
- **Concurrent browser installs** → one shared lock covers `init --browser` and bootstrap; a waiter rechecks and reuses the finished browser, a timeout names the owner, and a dead owner is reclaimed.

## Migration Plan

1. Land the environment script, lab/bootstrap changes and documentation.
2. In each existing worktree, run `source <(node <main>/scripts/worktree-env.mjs print)` from the worktree; a worktree created before this change does not contain the new script, so use the main checkout's copy and do not copy it into the worktree. Run `npm ci` first.
3. Run `node <main>/scripts/worktree-env.mjs check`; install the browser once with `init --browser` after `npm ci` if it is missing.
4. Existing worktree-local `.cache` directories can be removed after the shared caches are populated; they are not read when the environment is sourced.

Rollback: stop sourcing the environment and use the old commands. The shared root is additive; deleting it does not touch source, plugin state, review records or worktrees. No migration of existing caches is required.

## Open Questions

None. The pnpm store is used through the explicit `--store-dir "$PNPM_STORE_DIR"` form, which the task verification checks against the pinned pnpm version.
