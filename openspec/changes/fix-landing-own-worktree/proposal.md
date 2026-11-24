# Proposal

## Why

`prepare` used the same checkout as the review watch, `.cache/pr-review/worktrees/pr-<n>`. `abandon` removes the checkout recorded in the landing entry, so abandoning a prepared landing deleted the watch checkout while the pull request stayed open. The watch entry kept `status: commented` and its `worktree` pointed at a directory that no longer existed, so the next watch run could not reuse or verify the checkout.

The pipeline spec requires the watch to keep worktrees until the pull request is closed or merged, and requires abandon to remove the landing's own checkout without changing the watch entry. Both hold only if the landing has a checkout of its own.

## What Changes

- `prepare` creates the landing branch in its own checkout, `.cache/pr-review/worktrees/pr-<n>-land`, and never reuses or writes the watch checkout.
- `abandon`, `finish` and `state --forget` remove only the landing checkout. `finish` forgets the watch checkout through the watch's own path.
- A landing recorded before this change names the shared watch checkout. The next `prepare` rebuilds it at the new path: it moves the old checkout off the landing branch (leaving the directory untouched) and records the new path. Old shared checkouts are never deleted by the landing command; an operator cleans them up manually.
- Tests cover prepare, abandon, the surviving watch checkout, the rebuild and the dirty legacy checkout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

`pr-review-pipeline`: a new requirement states that the landing keeps its own checkout, that abandon removes only that checkout, and that a landing recorded against the watch checkout is rebuilt at the new path without deleting the old directory. The existing watch requirement only says worktrees are retained until the pull request is closed or merged, and the landing requirement only says abandon removes "its local checkout"; neither names a landing checkout, so the delta adds the contract instead of restating it.

## Impact

- `scripts/pr-review-land.mjs`: the landing worktree path, the legacy rebuild, and the checkout removal helpers.
- `test/pr-review-land.test.mjs`: the abandon assertion that pinned the shared checkout, plus new prepare, abandon, rebuild and dirty-legacy cases.
- `docs/pr-review.md`: the prepare step, the state layout and the manual cleanup of old shared checkouts.
- No spec change to the watch, no dependency, workflow, hook, coverage-baseline or `dist/` change.
