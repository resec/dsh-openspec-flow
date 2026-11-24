# Proposal

## Why

The shared Chromium install lock is created with `mkdirSync`, then the owner record is written into it. A holder that dies between those two steps leaves a lock directory with no owner. Waiters treat that directory as unusable and only reclaim it once its mtime is 30 minutes old, so `init --browser` and bootstrap fail after their wait timeout long after the holder is gone. The timeout message also omits the owner for such a lock, because there is none. The spec only covers reclaiming a lock whose recorded owner is dead, not a lock that never got an owner.

## What Changes

- Create the lock atomically: write the owner record into a staging directory and rename it onto the lock path, so the lock directory is only visible with its owner.
- Treat an ownerless lock directory younger than a short grace period as still being created; reclaim one older than that by renaming it aside before deleting it, so a lock another process just created is never removed in place.
- Include the owner in the timeout message, or state that the lock has no owner and when an ownerless lock is reclaimed.
- Extend `test/worktree-env.test.mjs` with an ownerless-lock reclamation test, an atomic-publication assertion, and an owner-bearing timeout assertion.
- Document the atomic creation and ownerless reclamation in `docs/apply-worktree-dev.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree-environment`: the "Concurrent worktree preparation" requirement gains atomic lock creation and ownerless-lock reclamation. The existing requirement covers a dead owner only, so the new behaviour needs a spec delta.

## Impact

- `scripts/worktree-env.mjs`: lock acquisition, ownerless and dead-owner reclamation, and the timeout message.
- `test/worktree-env.test.mjs`: three lock tests.
- `docs/apply-worktree-dev.md`: the Chromium lock section.
- No dependency, workflow, hook, coverage-baseline or `dist/` change; no browser download in tests.
