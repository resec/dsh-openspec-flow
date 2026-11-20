# Spec Delta

## Purpose

Defines the repository-side environment that makes plugin-created apply worktrees cheap to install and test in without sharing mutable runtime state.

## ADDED Requirements

### Requirement: Worktree environment resolution

`scripts/worktree-env.mjs` SHALL resolve the main worktree from any checkout of the repository and emit paths for the current worktree. It SHALL use `git worktree list --porcelain` for the main worktree, SHALL default the shared root to `<main>/.cache/openspec-flow/shared`, and SHALL accept an absolute `OPENSPEC_FLOW_SHARED_ROOT` override. It SHALL reject a relative path or one containing NUL, CR or LF.

#### Scenario: Running in the main checkout

- **WHEN** the command runs in the main worktree
- **THEN** the main worktree is the current top level and the shared root is under its `.cache/openspec-flow/shared`

#### Scenario: Running in a linked checkout

- **WHEN** the command runs in an apply worktree
- **THEN** the main worktree is the first `git worktree list --porcelain` entry, the shared root is under that main worktree, and `DSH_HOME` is under the current worktree

#### Scenario: An absolute shared-root override

- **WHEN** `OPENSPEC_FLOW_SHARED_ROOT` names an absolute directory
- **THEN** every emitted shared cache path uses that directory while `DSH_HOME` stays in the current worktree

#### Scenario: An invalid shared-root override

- **WHEN** `OPENSPEC_FLOW_SHARED_ROOT` is relative or contains NUL, CR or LF
- **THEN** the command exits non-zero and names the rejected value

### Requirement: Shared caches and per-worktree installs

The environment SHALL share the npm cache, pnpm store and Chromium binary directory under the shared root, and SHALL keep `node_modules` per worktree. It SHALL NOT create, symlink or otherwise share a `node_modules` directory between worktrees.

#### Scenario: Two worktrees prepare dependencies

- **WHEN** two worktrees run their installs with the exported environment
- **THEN** both use the shared npm cache or pnpm store while each worktree has its own `node_modules`

#### Scenario: No shared node_modules is exported

- **WHEN** the environment is printed
- **THEN** it contains no `node_modules` path and no instruction to link one

#### Scenario: Cache paths stay under the shared root

- **WHEN** the environment is printed without an override
- **THEN** the npm cache, pnpm store and Chromium path are all below `<main>/.cache/openspec-flow/shared`

#### Scenario: pnpm uses the exported store

- **WHEN** a developer runs the documented pnpm install command
- **THEN** it passes `--store-dir "$PNPM_STORE_DIR"` so the shared store is used

#### Scenario: check reports the pnpm version

- **WHEN** `check` runs and pnpm is available
- **THEN** it reports the pnpm version it observed

### Requirement: Per-worktree DSH profile isolation

Each worktree SHALL use its own `DSH_HOME` at `<worktree>/.cache/openspec-flow/dsh-home`. The environment SHALL NOT point `DSH_HOME` at the main worktree profile, the host home, or another worktree. The lab SHALL keep its per-run isolated home.

#### Scenario: Main and apply worktrees get distinct homes

- **WHEN** the environment is printed in the main worktree and in an apply worktree
- **THEN** the two `DSH_HOME` values are different and each is under its own worktree

#### Scenario: The lab keeps its per-run home

- **WHEN** a lab run starts with the exported environment
- **THEN** it still creates and uses its own run directory home rather than the exported worktree home

#### Scenario: An inherited DSH_HOME is rejected

- **WHEN** `check` runs with an inherited `DSH_HOME` that differs from the computed worktree home
- **THEN** it fails and names both the inherited and the computed path

### Requirement: Lab and bootstrap honor the environment

The lab and bootstrap SHALL use `LAB_NPM_CACHE` or `npm_config_cache` for npm content, `PLAYWRIGHT_BROWSERS_PATH` for Chromium, and SHALL keep their existing defaults when those variables are unset. Bootstrap SHALL NOT overwrite an explicitly set browser path.

#### Scenario: The lab uses the shared caches

- **WHEN** the lab runs with the exported environment
- **THEN** its npm cache and browser path are the exported shared paths

#### Scenario: Bootstrap uses the shared browser path

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** it installs or verifies the browser at that path instead of the worktree-local default

#### Scenario: Bootstrap resolves the browser path once

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** its presence check, `--reset-browsers` and installer all use the resolved path

#### Scenario: The lab consumes the resolved browser and npm paths

- **WHEN** the lab starts with a custom root and the exported environment
- **THEN** it uses the exported browser and npm cache paths instead of recomputing its own defaults

#### Scenario: A custom lab root keeps its default without the environment

- **WHEN** the lab starts with a custom root and no `PLAYWRIGHT_BROWSERS_PATH`
- **THEN** it uses `<root>/.cache/lab/pw-browsers`, not the repository root's default

#### Scenario: Unset variables keep the old defaults

- **WHEN** the lab or bootstrap runs without the exported variables
- **THEN** it uses its existing worktree-local cache and browser defaults

### Requirement: Concurrent worktree preparation

Chromium preparation SHALL serialize through one lock under the shared root, used by `init --browser` and bootstrap. A waiter SHALL wait and recheck, then reuse a browser the holder installed; it SHALL report the owner only on timeout. A dead owner's lock SHALL be reclaimable. Concurrent worktrees SHALL keep `node_modules`, `DSH_HOME` and output separate; lab ports stay OS-assigned.

#### Scenario: Two worktrees prepare Chromium concurrently

- **WHEN** two worktrees run `init --browser` at the same time
- **THEN** one installs under the shared lock and the other waits, rechecks and finishes with the same usable browser path

#### Scenario: Bootstrap and init share the lock

- **WHEN** bootstrap and `init --browser` prepare the same shared root at the same time
- **THEN** both use the same lock and only one Chromium installation runs

#### Scenario: A reset waits for the lock

- **WHEN** bootstrap runs `--reset-browsers` while another preparation holds the shared lock
- **THEN** the reset waits for the lock before checking and removing the shared browser directory

#### Scenario: A dead owner is reclaimed

- **WHEN** the lock records a process that no longer exists
- **THEN** the next preparation reclaims the lock and installs the browser

#### Scenario: A timeout names the owner

- **WHEN** a live owner holds the lock past the wait timeout
- **THEN** the waiter fails and names the owner instead of deleting the lock

#### Scenario: check reports a held lock

- **WHEN** `check` runs while another process holds the shared install lock
- **THEN** it reports the lock and its owner without removing it

#### Scenario: Concurrent tests keep their own state

- **WHEN** two worktrees run their test commands at the same time
- **THEN** each uses its own `node_modules`, `DSH_HOME` and output directory

#### Scenario: Lab ports stay OS-assigned

- **WHEN** two lab runs start concurrently
- **THEN** their web and mock servers bind OS-assigned ports and do not require a worktree port derivation

### Requirement: Developer-facing environment documentation

The repository SHALL document the environment command, the shared and per-worktree boundaries, the resolved browser path, concurrent preparation and rollback in `docs/apply-worktree-dev.md`. It SHALL link that document from `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md` and `README.md`, and SHALL update `docs/lab.md` and `CONTRIBUTING.md` where they name the old browser install and reset paths.

#### Scenario: A developer follows the documented command

- **WHEN** a developer runs the documented `source` command in an apply worktree
- **THEN** the printed npm, pnpm, Chromium and `DSH_HOME` values match the documented boundaries

#### Scenario: The documentation is linked

- **WHEN** a reader opens the lab, contribution, agent or README document
- **THEN** it links to `docs/apply-worktree-dev.md`

#### Scenario: Bootstrap documents the resolved browser path

- **WHEN** a reader opens `docs/lab.md` or `CONTRIBUTING.md`
- **THEN** the browser install and reset text names the `PLAYWRIGHT_BROWSERS_PATH` resolution order and keeps `.cache/lab/pw-browsers` as the default

#### Scenario: Rollback is documented

- **WHEN** a developer stops using the environment
- **THEN** the document states that removing the exported variables restores the old defaults and that deleting the shared root does not affect source, records or worktrees

### Requirement: No plugin coupling

`scripts/worktree-env.mjs` SHALL NOT read or write plugin worktree state, review records, locks, landed manifests or tool output. It SHALL resolve paths from git, the filesystem and the documented environment overrides only; it SHALL NOT add dependency-cache, browser, DSH-profile, port or environment fields to plugin state.

#### Scenario: No plugin state is touched

- **WHEN** the environment command runs in a worktree with no plugin state
- **THEN** it still prints the environment and creates no plugin state file

#### Scenario: The shared-root override is not plugin state

- **WHEN** `OPENSPEC_FLOW_SHARED_ROOT` is set
- **THEN** the command uses it as an environment input and still reads or writes no plugin state
