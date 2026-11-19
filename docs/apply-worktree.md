# Apply worktree state and locks

This document describes the change-scoped state and lock layer that later apply-worktree routing uses. It does not create, open, remove or land worktrees, and it does not route apply tools.

## State

A git project keeps one state file per change:

```text
<git common dir>/openspec-flow/apply/<store>#<change>.json
```

`<store>#<change>` is `local#<change>` when no store is selected. Non-git projects report the state unavailable and write no file.

The file carries `schemaVersion`, `change`, `store`, `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status`, `createdAt` and `lastUsedAt`. `store` is `null` without a store. `baseCommit` is the apply base; `sealedCommit` is the draft seal commit, or `null` for a standalone PR branch with `baseline: "none"`. `status` is `active`, `landed` or `archived`. There are no dependency-cache, browser, DSH-profile, port or other development-environment fields; a document carrying one is rejected.

Writes use a temporary file and a rename. A corrupt or incomplete state is reported, not replaced.

## Locks

Two directory locks serialize worktree lifecycle operations:

```text
<git common dir>/openspec-flow/lifecycle.lock.d
<git common dir>/openspec-flow/changes/<store>#<change>.lock.d
```

A lock is created by writing an owner record into a temporary directory and renaming that complete directory into place, so the lock path never exists without an owner. The owner record carries `schema`, `token`, `pid`, `at` and `what`. A waiter polls until its timeout, then fails naming the owner; it never removes a dead owner's lock.

The lifecycle lock is acquired first and released last. A change lock is acquired second and released first. Acquiring the lifecycle lock while holding a change lock is refused.

Release removes the directory only when the caller's token still matches. A changed owner is left in place and reported. A missing lock releases idempotently.

## Inspection

`openspec_inspect` with `action: "worktree"` is read-only and requires `change` (plus an optional `store`). It returns:

```text
status: ready | repair-required | unavailable
state: { path, exists, valid, error?, change?, store?, worktree?, branch?, status? }
locks: [{ scope, path, held, state?, reason?, owner?, alive? }]
worktree: { path?, exists }
repair: { action: none | recover | manual, scope?, expectedOwner?, message? }
```

A git project with no state file reports `status: "unavailable"`. A missing worktree or corrupt state gives `repair.action: "manual"`; a lock directory with no usable owner gives `repair.action: "manual"` naming the lock; a dead lock gives `repair.action: "recover"` with the scope and owner token. The action does not inspect npm, pnpm, Chromium, DSH profiles or ports; those belong to repository development scripts.

## Recovery

`openspec_apply_worktree` exposes `recover`:

```json
{ "action": "recover", "change": "add-dark-mode", "scope": "change", "expectedOwner": "<token>" }
```

`scope` is `lifecycle` or `change`; the change scope requires `change`. Recovery re-reads the owner under a recovery mutex and removes the lock only when the observed token matches and the process is dead. It refuses a live owner, a changed owner or a missing owner, and it does not delete state, worktrees, branches or review records. A recovery mutex left by a crash is named in the error for manual removal; it is not reported by inspection.

The existing per-change apply lock (`<git dir>/openspec-flow/apply.lock.json`) is separate from these lifecycle/change locks and keeps its current behavior.

## Non-goals

Creating or removing worktrees, routing apply tools, land and archive are later changes. Conflict with the existing apply lock is avoided by distinct paths; nothing here changes the installed plugin until a new tarball is installed.
