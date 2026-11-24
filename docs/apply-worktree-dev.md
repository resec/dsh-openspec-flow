# Apply worktree development environment

This document covers the repository-side environment for running installs and tests in plugin-created apply worktrees. The plugin's worktree behavior is documented in [`apply-worktree.md`](apply-worktree.md); this page owns dependency caches, DSH homes and the shared browser lock.

## Commands

From any checkout of the repository:

```sh
node scripts/worktree-env.mjs print
node scripts/worktree-env.mjs json
node scripts/worktree-env.mjs check
node scripts/worktree-env.mjs init
node scripts/worktree-env.mjs init --browser
```

`print` writes POSIX shell exports; source them explicitly:

```sh
source <(node scripts/worktree-env.mjs print)
```

A pre-existing worktree does not contain the script when it was created before this environment landed. Run the main checkout's copy from the worktree and do not copy the script into the worktree:

```sh
source <(node <main>/scripts/worktree-env.mjs print)
```

Run `npm ci` before `init --browser` so the worktree's pinned Playwright is used. `check` is read-only and reports missing directories, a mismatched inherited `DSH_HOME`, the pnpm version and a held install lock. `init --browser` installs Chromium under the shared lock; it can be run from any worktree.

## Shared and per-worktree paths

The shared root defaults to `<main>/.cache/openspec-flow/shared` and can be overridden with an absolute `OPENSPEC_FLOW_SHARED_ROOT`.

| Path | Scope |
| --- | --- |
| `<shared>/npm` | shared npm cache |
| `<shared>/pnpm-store` | shared pnpm store |
| `<shared>/pw-browsers` | shared Chromium |
| `<shared>/.install.lock` | Chromium preparation lock |
| `<worktree>/.cache/openspec-flow/dsh-home` | per-worktree `DSH_HOME` |
| `<worktree>/node_modules` | per-worktree dependencies |
| `<worktree>/.cache`, `.coverage`, `dist` | per-worktree test output |

`node_modules` is never shared. `npm ci` deletes and rebuilds it, and different worktrees can carry different lockfiles. The shared package caches give the download and disk benefit without that hazard.

## pnpm store

pnpm does not reliably read `PNPM_STORE_DIR` on its own. Pass the exported path explicitly:

```sh
pnpm install --store-dir "$PNPM_STORE_DIR"
```

The JSON output and `check` expose the same path and the observed pnpm version.

## Chromium preparation and the lock

`init --browser` and bootstrap's browser step use one lock at `<shared>/.install.lock`. The lock covers the presence check, `--reset-browsers` and the install, so a reset cannot delete a browser another worktree is installing.

- The lock directory appears with its owner record or not at all: the owner is written into a staging directory that is renamed into place.
- A waiter polls, then rechecks and reuses a browser the holder installed.
- A timeout reports the owner instead of deleting the lock; an ownerless lock is reported as having no owner.
- A lock whose recorded pid is dead, or a lock with no owner that is older than five seconds, is moved aside and reclaimed by the next caller.
- `check` reports a held lock and its owner without removing it.

Browser path resolution is: `PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`. Bootstrap uses the same resolved path for the presence check, `--reset-browsers` and the installer.

```sh
# Install once, from any worktree, after npm ci
node scripts/worktree-env.mjs init --browser

# Recover a stale shared browser directory
./scripts/bootstrap.sh --reset-browsers
```

## Concurrency

Each worktree keeps its own `node_modules`, `DSH_HOME`, coverage, `dist` and lab run directory. The npm cache, pnpm store and Chromium directory are shared. Chromium preparation is serialized; package installs may run concurrently against the shared cache.

Lab and mock server ports are OS-assigned (`--port 0`, `listen(0)`). No worktree-derived port is needed, so two lab runs can overlap.

`DSH_HOME` is always the current worktree's own home. Do not point it at the main profile or another worktree; `check` rejects an inherited value that differs. Source the environment for installs and tests, not for an interactive DSH session that should keep the user's profile.

## Pushing landed main

This environment does not push. After a land, use the repository-side verifier and explicit push documented in [`land-push.md`](land-push.md); it reads the landed manifest and git state, not these caches or `DSH_HOME`.

## Rollback

Stop sourcing the environment and use the old commands; the worktree-local defaults return. The shared root is additive: deleting `<shared>` does not touch source, plugin state, review records, landed manifests or apply worktrees. Do not delete the parent `.cache/openspec-flow/`, which also contains active worktrees.
