# Proposal: Run apply in a worktree

## Why

The apply state and lifecycle/change locks now exist, but `openspec_apply_next` still advances the change in the main worktree and the project-wide apply lock refuses a second change. That prevents parallel apply and keeps implementation writes in the main tree. This change creates or reuses a per-change worktree, moves the changer session there, and routes the apply reads and writes through it.

## What Changes

- In a git project, `openspec_apply_next` after a ready draft and seal commit creates or reuses an apply worktree at `<main>/.cache/openspec-flow/worktrees/<stateKey>` on a branch-safe `openspec/apply/<slug>-<hash>` branch, from the seal commit, under the per-change lock, while inspecting any legacy project-wide lock.
- The plugin writes the shared state with the worktree, branch, base and seal commits, returns the worktree facts, and moves the changer session's working directory to the worktree. The main worktree is not written by the apply implementation.
- `openspec_mark_task_done`, `openspec_inspect` `action: "validate"` and the apply-state reads use the worktree; `list`, `status`, `show`, `instructions` and `context` stay main-worktree reads. Draft review, intent and the seal stay on main.
- An existing clean branch/PR worktree can be reviewed with `openspec_review worktree=<path>` and `baseline: "none"`; the plugin writes a review state with a null seal and never creates, moves or deletes that checkout.
- Git worktree apply uses the per-change lock instead of the project-wide apply lock, so different changes apply concurrently; non-git projects keep the current serial lock. Archive of a worktree-applied change is deferred to `land-apply-worktree`, which owns the terminal step.
- Dependency caches, DSH profiles, ports and pushing are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: add worktree creation/reuse, state population, session-directory routing, existing branch worktree review, per-change apply serialization and creation cleanup.
- `tool-surface`: add the worktree projection and session-directory rules to the apply tools and the apply review.

## Impact

- New worktree creation/reuse and routing modules; `openspec_apply_next`, `openspec_mark_task_done`, `openspec_inspect`, `openspec_review`, the apply cache and the Host `workingDirectory` service.
- Per-change apply serialization: `acquireApplyLocks` is no longer used for git worktree apply; `openspec_archive` refuses a worktree-applied change until land exists.
- Tests for creation from the seal commit, change visibility, session cwd, routing, concurrency, existing PR worktrees, branch-safe names, ignore handling and failure cleanup.
- README, `docs/review.md`, `docs/apply-worktree.md`, the apply skill and policy text.
- Deployment dependency: do not install this change without `land-apply-worktree`; until land exists, a worktree-applied change cannot be archived.
- No new dependency and no land/manifest/push implementation.
