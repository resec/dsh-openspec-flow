# Design: Apply worktree state and lifecycle locks

## Context

See `proposal.md` — Why. This change depends on `share-review-records` being archived first: that change adds the git common-directory resolver and the shared review root. The existing per-change apply locks stay where they are; this change adds separate lifecycle locks for the worktree routing that follows.

## Goals / Non-Goals

Goals:

- One state file per change under the git common directory, after a worktree exists.
- A lifecycle lock and a per-change lock created atomically with an owner, released only by the owner, and recovered only by explicit compare-and-delete.
- A read-only `openspec_inspect` worktree action and a `recover` tool action.
- No dependency-cache, profile, browser or port knowledge in the plugin.

Non-Goals:

- Creating, opening or removing worktrees.
- Routing apply tools into a worktree.
- Land, archive, review record paths, cache layout, DSH profiles or ports.
- Replacing the existing per-worktree apply locks.

## Decisions

### State lives beside the shared review root

The state root is `<git common dir>/openspec-flow/apply`. The state key is `reviewKey(store, change)` (`<store>#<change>`, or `local#<change>`), reused from the review store so both names and safe-segment checks stay in one place. A non-git project reports the state unavailable and writes nothing.

The state file is written only after a worktree exists. All required fields are therefore always present: `schemaVersion`, `change`, `store`, `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status`, `createdAt`, `lastUsedAt`. `store` is `null` when no store is selected; `baseCommit` is the apply base and `sealedCommit` is the draft seal commit, or `null` for a standalone PR worktree with no draft seal. `status` is one of `active`, `landed` or `archived`. There is no pending record and no environment extension point.

`mainRoot` is resolved by reading `git worktree list --porcelain` and taking the first `worktree` entry; a main checkout with no linked worktrees returns its own top level. The rule is implemented directly with that command in the new state module, and it avoids `--show-toplevel` returning the linked worktree.

### Atomic writes and safe names

A state write uses a temporary file in the same directory and a rename over the target. A read validates JSON and every required field; a corrupt state is reported, never replaced. `reviewKey` and its `assertSafeSegment` guard are reused for the state file and lock directory names, so `/`, `\`, `..` and NUL are refused before a path is built.

### Lock creation is an all-or-nothing rename

A lock is created by making a unique temporary directory next to the lock path, writing the owner record into it, and renaming the complete directory to the lock path. The lock path therefore never exists without an owner. If the rename fails because the path exists, the temporary directory is removed and the caller waits. A crash before the rename leaves only a temporary directory, not a lock; inspect reports only held locks, not the temporary directory.

The owner record is `{schema, token, pid, at, what}`. A waiting acquisition polls until `timeoutMs` (default ten minutes), then fails naming the owner and directory. A dead owner is never removed by a waiting path.

### Release is owner-checked

`release` re-reads the owner and removes the directory only when the token matches the caller's token. A mismatch leaves the directory and reports the current owner. Releasing a missing lock succeeds idempotently. A timed-out waiter never reaches a release, and its cleanup does not delete another owner's lock.

### Locks have one order

The lifecycle lock is acquired first and released last. The change lock is acquired second and released first. A process-local held set refuses a lifecycle acquisition while a change lock is held, so a nested caller cannot deadlock itself.

### Recovery is token-only

`recover` accepts a lock `scope` (`lifecycle` or `change`) and an `expectedOwner` token. It creates a recovery mutex directory with its own token owner, re-reads the observed lock, deletes it only when the token still matches and the process is dead, then removes the mutex. It never deletes a live owner, a changed owner, a missing owner, or any state/worktree/branch/review file. A recovery mutex left by a crash is named in the recover error for manual removal; inspect does not report it, and a waiter never deletes it.

### Worktree inspection is an inspect action

`openspec_inspect` gains `action: "worktree"`. It returns:

```text
status: "ready" | "repair-required" | "unavailable"
state: { path, exists, valid, error?, change?, store?, worktree?, branch?, status? }
locks: [{ scope, path, held, state?, reason?, owner?, alive? }]
worktree: { path?, exists }
repair: { action: "none" | "recover" | "manual", scope?, expectedOwner?, message? }
```

The action is read-only. `repair.action` is `recover` for a dead lock and `manual` for a missing worktree, a corrupt state or a lock with no usable owner, because this change has no create or state-repair action. It never inspects npm, pnpm, Chromium, DSH profiles or ports.

`openspec_apply_worktree` exposes only `recover` in this change; create/land/remove actions belong to later changes. The tool is denied to the reviewer through the existing deny-all-global-Host-tools preset.

### Documentation and tests

`docs/apply-worktree.md` describes the state fields, lock paths, owner/recovery protocol, inspect result and non-goals. `README.md` lists the tool and the document. The apply skill and `lib/policy.js` sentence about a paused change's lock is qualified: it refers to the existing apply lock, while the new lifecycle/change locks are recovered with `openspec_apply_worktree action=recover`. A new documentation test reads both the document and the README row.

## Risks / Trade-offs

- [The state and locks have no production caller yet] → keep them independently tested; the routing change is the first consumer, and doctor reports an absent state as `unavailable` rather than an error.
- [The ten-minute default may exceed a Host tool-call timeout] → the routing change must make the wait configurable or bound it to the call; this change only defines the primitive.
- [New locks coexist with the existing per-worktree apply lock] → distinct paths and names; doctor reports only the new locks and the documentation names the old lock separately.
- [A crash leaves a temporary owner directory] → it is not a lock and inspect does not report it; the next acquisition uses a new unique temporary name.
- [A repository script wants cache state] → it keeps its own file; the plugin rejects that field.

## Migration Plan

1. Deploy after `share-review-records` is archived; verify `reviewRoot` resolves under the git common directory first.
2. No existing state file is migrated. Existing apply locks keep their location and behavior.
3. Rollback: remove the inspect action, tool registration and new modules; the old version reads no state and no lock at the new paths.

## Open Questions

None.
