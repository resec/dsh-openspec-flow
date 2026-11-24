# Proposal

## Why

Land releases the apply session's change lock before it takes the lifecycle lock, because the lifecycle lock has to come first. When the lifecycle lock could not be taken (a dead owner's lock, for example), land threw without putting the change lock back: the state still said `active` with the old token, but the lock directory was gone, so another process could take the same change's lock while the state claimed this session owned it.

## What Changes

- After a failure before the merge that leaves land without the fresh change lock, land re-creates the released change lock under its original owner record, without waiting.
- A change lock that was missing before the handover stays missing; the state is not rewritten, because land never left `active` on this path.
- State the restored lock in the requirement and its failed-handover scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: `Land takes over the apply lock` says that the restored change lock keeps its token and that land does not wait for it.

## Impact

- `lib/worktree/land.js`: one restore step in the handover's `finally`.
- `lib/worktree/lock.js`: `acquireLock` accepts `owner`, the record to publish in the lock it creates. The ordering guard and the dead-owner and corrupt-lock handling are unchanged.
- `test/worktree-land.test.mjs`: two cases on the `readyLand` fixture.
- `docs/apply-worktree.md`: one sentence in the land paragraph.
