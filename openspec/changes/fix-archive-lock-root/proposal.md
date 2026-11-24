# Proposal

## Why

In a non-git project, apply acquires its project lock at the nearest OpenSpec
root of the session cwd, but the archive gate resolved `cwd` itself. When the
session cwd was a subdirectory such as `<root>/pkg`, the gate inspected
`<root>/pkg/openspec/.review/apply.lock.json` instead of
`<root>/openspec/.review/apply.lock.json`. The second change's apply was
correctly refused, yet its archive succeeded and did not release the first
change's lock, so the two paths disagreed about which lock governs the project.

## What Changes

- Resolve the archive gate's implementation domain with `implementationRootOf`,
  the helper apply already uses, instead of a second inline fallback to `cwd`.
  A non-git session below the OpenSpec root now checks the nearest project root.
- Keep the existing worktree branches: `mainWorktreeRoot` for the enabled path
  and the apply helper's git-worktree/nearest-root fallback for the disabled
  compatibility path.
- Add a non-git subdirectory reproduction and regressions for the
  worktree-disabled git path and the git worktree path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already requires every apply entry to acquire the
applicable lock and refuses the archive of another change while a lock names a
different change; only the gate's root resolution did not match the acquisition
path, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: the lock root in `assertApplyReviewReady`.
- `test/review-serial.test.mjs` and `test/review-fixtures.mjs`: an optional
  `cwd` for `setup` and three tests.
- No lock record, payload, docs, dependency, workflow or `dist/` change.
