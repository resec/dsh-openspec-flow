# Proposal

## Why

`openspec_apply_worktree action=remove` stopped early only when `cleanup.worktreeRemoved` was `true`. An archived state whose checkout had been removed by hand, or whose cleanup never recorded the removal, fell through to the delete path: the missing directory was skipped and remove then deleted the seal ref and the state file. A later land for that change fails with "requires an active or landing state", and only the change listing remains.

## What Changes

- Decide first whether an archived state's cleanup already ran: keep the state, the seal ref and the cleanup record when `cleanup.worktreeRemoved` is `true`, when the recorded checkout is gone, or when the recorded branch is gone.
- Delete the seal ref and the state file only on the path that really removes the checkout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `apply-worktree` spec already requires remove to succeed for an archived state whose checkout or branch is already gone and to keep the state ("Remove is idempotent after cleanup"), so this change sets `skip_specs: true` and fixes only the implementation.

## Impact

- `lib/worktree/land.js`: the remove guard in `removeApplyWorktree` and one helper.
- `test/worktree-land.test.mjs`: cases for the preserved and the removed archived states.
- No spec delta, dependency, hook, workflow, coverage baseline or `dist/` change.
