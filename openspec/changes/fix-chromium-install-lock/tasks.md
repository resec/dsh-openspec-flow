# Tasks

## 1. Make the lock atomic

- [x] 1.1 Write the owner record into a staging directory and rename it onto the lock path, cleaning the staging directory up on failure.
- [x] 1.2 Keep treating a lock whose recorded pid is dead as reclaimable, moving it aside before deleting it.

## 2. Reclaim an ownerless lock

- [x] 2.1 Keep an ownerless lock younger than a five-second grace period and reclaim one older than that by renaming it aside first.
- [x] 2.2 Report the owner on timeout, or state that the lock has no owner and when an ownerless lock is reclaimed.

## 3. Guard the behaviour

- [x] 3.1 Assert that a fresh ownerless lock times out without being removed and that an aged one is reclaimed.
- [x] 3.2 Assert that the lock directory is published with its owner and leaves no staging directory.
- [x] 3.3 Assert that a live lock's timeout message names the owner and leaves the lock in place.

## 4. Documentation

- [x] 4.1 Describe atomic creation and ownerless reclamation in `docs/apply-worktree-dev.md`.

## 5. Verify

- [x] 5.1 Run `node --test test/worktree-env.test.mjs` and confirm the new assertion fails with the previous acquisition code.
- [x] 5.2 Run `/tmp/b3/gates.sh fix-chromium-install-lock`.
