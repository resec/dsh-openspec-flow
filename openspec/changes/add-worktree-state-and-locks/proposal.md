# Proposal: Add apply worktree state and lifecycle locks

## Why

Applying a change in its own worktree needs two pieces before apply can be routed there: a change-scoped record of which checkout exists, and locks that serialize worktree lifecycle operations while allowing different changes to apply concurrently. Without them, apply routing would have no shared place to record a worktree and no way to stop two land, remove or archive operations from interleaving.

This change depends on `share-review-records` being archived first: that change provides the git common-directory resolver and the shared review root this state and lock layer sits beside.

## What Changes

- Add a git-common-directory state file per change at `openspec-flow/apply/<store>#<change>.json` recording the change, main worktree root, worktree path, branch, base and seal commits and lifecycle status.
- Add a lifecycle lock and a per-change lock under the git common directory, created atomically with an owner token, pid, operation label and wait timeout, released only by the owning token, and recovered only by explicit compare-and-delete.
- Extend `openspec_inspect` with a read-only `worktree` action that reports state, locks and doctor fields, preserving the single inspect read surface.
- Add `openspec_apply_worktree` with the `recover` action; future create/land/remove actions belong to later changes.
- Keep the state and tool free of dependency caches, DSH profiles, browser caches or port allocation; those belong to the repository's development scripts, not the plugin.
- Do not create worktrees, route apply tools, land or archive in this change.

## Capabilities

### New Capabilities

- `apply-worktree`: change-scoped apply worktree state, lifecycle and per-change locks, and the read-only inspection and explicit recovery surface that inspects and recovers them.

### Modified Capabilities

- `tool-surface`: add the read-only `worktree` action to `openspec_inspect` and expose `openspec_apply_worktree` with `recover`.

## Impact

- New `lib/worktree/` state and lock modules, plus an inspect projection and a recover tool registration.
- Tool registration in `lib/tools/index.js`, the inspect output schema and the tool catalog tests.
- New tests covering state validation, atomic writes, lock creation/release, contention, dead-owner recovery, inspect output and doctor output.
- `README.md`, `docs/apply-worktree.md`, and the apply skill/policy sentence that distinguishes the existing apply lock from the new lifecycle locks.
- No apply routing, no worktree creation, no land/archive, no dependency change, and no environment assumption about caches, profiles or ports.
- Prerequisite: `share-review-records` archived, so `reviewRoot` and the common-directory resolver exist.
