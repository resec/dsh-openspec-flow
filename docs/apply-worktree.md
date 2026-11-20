# Apply worktree

This document describes the change-scoped apply worktree, its state, locks, routing and the existing-branch review path.

## Creation

In a git project, `openspec_apply_next` creates or reuses:

```text
<main>/.cache/openspec-flow/worktrees/<store>#<change>
branch: openspec/apply/<slug>-<hash8>
```

The branch slug replaces every character outside `[A-Za-z0-9_-]` with `-`; the hash is the first eight hex characters of SHA-256 over the state key. Creation starts from the seal commit, so the drafted change is present without copying uncommitted files. The plugin adds `.cache/openspec-flow/worktrees/` to the local `<git common dir>/info/exclude` when needed, never to a tracked `.gitignore`.

The per-change lock is acquired before creation and kept across apply. The lifecycle lock is not used for creation; it serializes removal, land and archive. A state with `status: landing` belongs to land and is refused by apply. A failed creation restores the session to main, removes the worktree and its branch, deletes any state it wrote and releases the lock.

`worktree.enabled` defaults to `true`. Setting it to `false` keeps the previous single-tree apply for compatibility or diagnosis; new work should leave it on.

## Session and routing

After creation, `openspec_apply_next` moves the changer session with the Host `workingDirectory` service and returns:

```text
worktree: { path relative to root.path, branch, base, mainRoot }
root.path: the main worktree
```

`openspec_mark_task_done` and `openspec_inspect` `action: "validate"` run against the worktree. `openspec_inspect` `list`, `status`, `show`, `instructions` and `context` stay main-worktree reads. Draft review, intent and the seal stay in main.

The apply cache keys on `cwd + change + store`. When the state names a different worktree, the old cache entry is not reused.

## Existing branch or PR worktree

`openspec_review` apply `start` and `resume` accept `worktree`. The path must be a linked checkout in the same git common directory, not the main worktree, clean and contain the change. The reviewer is activated in that directory. The plugin writes a review-only state with `sealedCommit: null`, the explicit base, and null lock fields, and never creates, moves or deletes the checkout.

## State

A git project keeps one state file per change:

```text
<git common dir>/openspec-flow/apply/<store>#<change>.json
```

It carries `schemaVersion`, `change`, `store`, `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status`, `createdAt`, `lastUsedAt`, `lockToken` and `lockPid`, and may carry `cleanup` with `worktreeRemoved`, `branchRemoved`, `at` and `error`. `store` is `null` without a store. `baseCommit` is the apply base; `sealedCommit` is the draft seal, or `null` for a standalone PR branch. `lockToken` and `lockPid` are the per-change lock owner, or `null` for a PR state or after release. `status` is `active`, `landing` or `archived`. No dependency-cache, browser, DSH-profile, port or environment field is stored; an unknown field is rejected.

Writes use a temporary file and a rename. A corrupt or incomplete state is reported, not replaced.

## Locks

```text
<git common dir>/openspec-flow/lifecycle.lock.d
<git common dir>/openspec-flow/changes/<store>#<change>.lock.d
```

A lock is created by writing an owner record into a temporary directory and renaming the complete directory into place. The owner record carries `schema`, `token`, `pid`, `at` and `what`. A waiter polls until its timeout, then fails naming the owner; the general waiter never removes a dead owner's lock, while apply may reclaim a dead free lock as described below. A caller may re-enter with the state's recorded token from the same pid. When the recorded pid is dead and the lock is free, apply may acquire it and replace the token/pid.

The lifecycle lock is acquired first and released last. A change lock is acquired second and released first. Acquiring the lifecycle lock while holding a change lock is refused.

Release removes the directory only when the caller's token still matches. A changed owner is left in place and reported. A missing lock releases idempotently.

## Inspection and recovery

`openspec_inspect` with `action: "worktree"` is read-only and returns:

```text
status: ready | repair-required | unavailable
state: { path?, exists, valid, error?, change?, store?, worktree?, branch?, status? }
locks: [{ scope, path, held, state?, reason?, owner?, alive? }]
worktree: { path?, exists }
repair: { action: none | recover | cleanup | manual, scope?, expectedOwner?, message? }
```

The `repair.action` is `none`, `recover`, `cleanup` or `manual`. A git project with no state reports `unavailable`. An archived state whose cleanup is incomplete, including a legacy archived state whose worktree still exists, gives `cleanup` and points at a land retry. A missing worktree without a cleanup record or corrupt state gives `manual`; a lock directory with no usable owner gives `manual` naming the lock; a dead lock gives `recover` with the scope and owner token. The action does not inspect npm, pnpm, Chromium, DSH profiles or ports.

## Land and remove

`openspec_apply_worktree` exposes three actions:

```json
{ "action": "recover", "change": "add-dark-mode", "scope": "change", "expectedOwner": "<token>" }
{ "action": "land", "change": "add-dark-mode", "approvedBy": "user" }
{ "action": "remove", "change": "add-dark-mode" }
```

`land` runs in main under the lifecycle and a fresh change lock. When the worktree is behind main and the apply review is ready, it writes `rebaseReview` to the apply record under the review-directory lock after verifying the change-lock owner, then refuses with the rebase, retest and re-review instruction. It releases the recorded apply change lock, sets `landing`, merges the worktree branch with `--no-ff`, verifies the merged tree equals the required tree, archives and commits in the same section, writes `<common>/openspec-flow/landed/<merge>.json`, marks the state `archived`, clears `rebaseReview` under the review lock, then removes the plugin worktree and deletes its local branch while keeping the state and manifest. `cleanup` records the two flags; a cleanup failure keeps `archived`, records `cleanup.error` and returns `cleanup.complete: false`. It never pushes. A failed archive or commit keeps the merge and worktree for a retry. A later land on an archived state with a manifest and incomplete cleanup retries only the cleanup.

`recover` removes the lock only when the observed token matches and the process is dead. It refuses a live owner, a changed owner or a missing owner, and does not delete state, worktrees, branches or review records.

`remove` deletes only an archived plugin-created checkout (or an explicitly abandoned one with user approval and a reason), keeps its branch and deletes the state. A PR worktree is refused. After land cleanup, `remove` is idempotent: it succeeds without deleting the state and without failing on the missing checkout or branch.

`openspec_archive` refuses a plugin-created active or landing state and points at `openspec_apply_worktree action=land`.

## Non-goals

The plugin does not push. Landed-manifest history beyond one file per merge and dependency caches are out of scope for the plugin; the repository-side push step is documented in [land-push.md](land-push.md). Migration of an existing main-applied change is manual.
