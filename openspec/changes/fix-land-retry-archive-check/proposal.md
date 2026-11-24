# Proposal

## Why

`findLanding` treats any commit on main whose only parent is the branch tip as the archive commit of a `landing` state. A comment says the commit "already carries the required tree", but neither the tree nor the content is read. When an unrelated commit lands on main between the fast-forward and the retry, land reports success, records that commit as `archiveCommit`, marks the cleanup complete and removes the worktree and branch while the change directory is still in the main tree and nothing was archived.

## What Changes

- Before the single commit after the branch tip is accepted as the archive commit, verify that its tree no longer contains the change directory.
- Refuse otherwise, before any lock is taken, with a message that names the non-archive commit and the recovery action; land does not repair main.
- State the rule as a new requirement next to the land requirements. `A failed land keeps a resumable state` is not modified: its description has little room left under the length limit, and the verification is a behavior of its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: adds `A landing retry verifies the archive commit`.

## Impact

- `lib/worktree/land.js`: `findLanding` reads the tree of the candidate archive commit.
- `test/worktree-land.test.mjs`: one refusal case on the fast-forward fixture.
- `docs/apply-worktree.md`: one sentence in the land paragraph.
- The legacy-merge retry branch, the lock order and the archive path are unchanged.
