# Proposal

## Why

`acquireLock` kept one process-wide set of git common directories that hold a change lock. A lifecycle request was refused whenever the set contained the directory, so with change A applied in a process, archiving change B failed with "release the change lock first", although that lock was A's and B owned nothing. Releasing any one change lock removed the whole entry, so the guard then ignored every other change lock the process still held.

## What Changes

- The guard records the change locks this process holds by lock path and refuses a lifecycle request only when the request names a change whose lock this process holds.
- A lifecycle request that names no change is still refused while the process holds any change lock: it cannot show that it concerns another change.
- `openspec_archive`, and the land, land-cleanup and remove paths, name their change in the lifecycle request.
- Releasing a change lock removes that lock's entry only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `apply-worktree` already requires it: "The change lock is scoped per change" says acquiring a change lock SHALL NOT block a different change's lock, and "Git apply is serialized per change" says the lifecycle lock covers removal, land and archive only. "Locks are acquired in one fixed order" exists so that a caller does not hand its own change lock over to the lifecycle lock; its "Reverse order is refused" scenario is read as the same change's lock. The implementation did not meet the per-change requirement, so this change sets `skip_specs: true`.

## Impact

- `lib/worktree/lock.js`: the held-change registry, the lifecycle guard and the release cleanup.
- `lib/tools/write.js`, `lib/worktree/land.js`: the lifecycle requests name their change.
- `test/worktree-lock.test.mjs`, `test/review-serial.test.mjs`, `test/worktree-land.test.mjs`: guard, release, archive, land and remove cases.
- `docs/apply-worktree.md`, `docs/review.md`: the guard is described per change.
- No dependency, workflow, hook, coverage-baseline, `dist/` or `package.json` change.
