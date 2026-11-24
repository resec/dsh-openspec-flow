# Tasks

## 1. Refuse a dead owner lock

- [x] 1.1 Remove the `reclaimDead` bypass from `acquireLock`, so a dead owner always fails with the recover hint.
- [x] 1.2 Drop `reclaimDead: true` from both change-lock acquisitions in `createOrReuseApplyWorktree`.

## 2. Guard the behavior

- [x] 2.1 Replace the "can be reclaimed by apply" lock test with a refusal assertion that checks the recover hint and the surviving lock.
- [x] 2.2 Assert that apply refuses a dead owner lock, names the recover action with the token, and publishes no worktree or state.
- [x] 2.3 Assert that apply succeeds after `recoverLock` removes the dead lock, and that a reuse of an active worktree is refused the same way.
- [x] 2.4 Assert that two processes recovering the same change yield exactly one success.
- [x] 2.5 Confirm the refusal assertion fails against the pre-fix implementation.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-lock.test.mjs test/worktree-create.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-apply-dead-lock-recovery`.
