# Tasks

## 1. Keep the archived state

- [x] 1.1 Treat a missing checkout, a missing branch or `cleanup.worktreeRemoved: true` as a finished cleanup and return without deleting the state, the seal ref or the cleanup record.
- [x] 1.2 Delete the seal ref and the state file only on the path that removes the checkout.

## 2. Cover both paths

- [x] 2.1 Assert the state, the seal ref and the cleanup record survive when no cleanup was recorded and the checkout is gone.
- [x] 2.2 Assert they survive when `worktreeRemoved` is `false` and the checkout is gone.
- [x] 2.3 Keep the existing behaviour when `worktreeRemoved` is `true` and `branchRemoved` is `false`.
- [x] 2.4 Assert an archived checkout that still exists is removed with its state and seal ref, and its branch is kept.
- [x] 2.5 Confirm cases 2.1 and 2.2 fail against the previous implementation.

## 3. Verify

- [x] 3.1 Run `node --test --test-name-pattern="remove" test/worktree-land.test.mjs`.
- [ ] 3.2 Run `/tmp/b3/gates.sh fix-remove-keeps-archived-state`.
