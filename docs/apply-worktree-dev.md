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
| `<shared>/toolchain/node/<version>` | downloaded Node bucket |
| `<shared>/toolchain/pnpm/<version>` | pinned pnpm bucket |
| `<shared>/browsers/playwright-<version>` | Chromium bucket |
| `<shared>/browsers/playwright-<version>.install.lock` | that bucket's preparation lock |
| `<worktree>/.cache/toolchain/manifest.json` | per-worktree toolchain record |
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

## Toolchain record and deps-only preparation

Each worktree carries its own `<worktree>/.cache/toolchain/manifest.json`, written by bootstrap after the pnpm bucket, dependencies, Chromium bucket and the other preparation steps succeed. It names the Node, npm, pnpm and Chromium paths, the shared buckets and the input hashes. The lab and the pre-push hook read the current worktree's record; a stale record is refused with its correction, and a missing record falls back to `PATH`.

`./scripts/bootstrap.sh --deps-only` prepares the buckets and the record without Git hooks, the lab doctor or tests. Apply worktree creation runs it automatically and rolls the worktree back when it fails; a branch created before `--deps-only` existed fails with the usage diagnostic instead of skipping preparation. Collection runs after the record: unreferenced, unlocked buckets older than one hour are deleted, a corrupt record aborts collection without failing the preparation, and `--no-gc` / `--gc-dry-run` control it.

## Chromium preparation and the lock

`init --browser` and bootstrap's browser step use one lock per bucket at `<shared>/browsers/playwright-<version>.install.lock`. The lock covers the presence check, `--reset-browsers` and the install, so a reset cannot delete a browser another worktree is installing, and two Playwright versions may install concurrently.

- A waiter polls, then rechecks and reuses a browser the holder installed.
- A timeout reports the owner instead of deleting the lock.
- A lock whose recorded pid is dead is reclaimed by the next caller.
- `check` reports a held lock and its owner without removing it.

Browser path resolution is: `PLAYWRIGHT_BROWSERS_PATH` when set, otherwise the worktree's Playwright-version bucket. Bootstrap uses the same resolved path for the presence check, `--reset-browsers` and the installer; the lab uses the record's browser path when a record exists.

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
