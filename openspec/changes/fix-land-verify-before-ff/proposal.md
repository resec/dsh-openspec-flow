# Proposal

## Why

Land fast-forwards main to the state's branch tip and only afterwards compares the result with the worktree head. When the worktree is checked out at an older or newer commit than its branch, the comparison fails after main has already moved: the state returns to `active`, the planning copy is restored, no manifest or archive commit exists, and the message tells the user to rebase against main although main moved to the user's own branch tip.

## What Changes

- Refuse before the planning copy is reconciled when the worktree head is not the tip of the state's branch, so the fast-forward never starts.
- Name the branch and the worktree-side correction in the refusal instead of "behind main".
- State the refusal in the `A failed land keeps a resumable state` requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: `A failed land keeps a resumable state` also requires land to refuse before the fast-forward when the worktree head is not the branch tip.

## Impact

- `lib/worktree/land.js`: one check before `reconcilePlanningCopy`.
- `test/worktree-land.test.mjs`: two cases, a worktree behind and ahead of its branch.
- `docs/apply-worktree.md`: one sentence in the land description.
- `findLanding`, the retry branch, the lock order, the rebase marker and the post-merge comparison are unchanged.
