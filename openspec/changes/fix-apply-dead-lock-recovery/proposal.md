# Proposal

## Why

The apply creation flow passed `reclaimDead: true` on both of its change-lock acquisitions, so `acquireLock` removed a dead owner's lock with a plain `rmSync` instead of going through recovery. That contradicted the module contract ("a waiter never removes a dead owner's lock; recovery is an explicit compare-and-delete") and the apply-worktree spec, which deletes a lock only inside `recover`, under a recovery mutex and after re-reading the owner token. Two sessions starting apply for the same change could also let the later one delete a lock the earlier one had just taken.

## What Changes

- Remove the `reclaimDead` bypass from `acquireLock`; a dead owner always fails the acquisition and the error names the recover action with the scope and owner token.
- Drop `reclaimDead: true` from both change-lock acquisitions in `createOrReuseApplyWorktree`, so apply refuses a dead owner lock and points at `openspec_apply_worktree action=recover`.
- Replace the test whose name claimed apply reclaims a dead lock with one that asserts the refusal plus the recover hint, and add apply-level and two-process recovery tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The apply-worktree spec already states that recovery deletes only a dead owner, under a recovery mutex and after the token check, and that acquisition may take over only a free lock; the implementation was the part that did not follow it, so this change sets `skip_specs: true`.

## Impact

- `lib/worktree/lock.js`: the dead-owner branch of `acquireLock`.
- `lib/worktree/create.js`: both change-lock acquisitions.
- `test/worktree-lock.test.mjs`, `test/worktree-create.test.mjs`: the refusal, recover-then-apply and concurrent-recovery tests.
- No payload, state, dependency, workflow, hook, coverage-baseline or `dist/` change.
