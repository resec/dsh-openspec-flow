# Tasks

## 1. Cross-process lock helper

- [x] 1.1 Add `test/fixtures/lock-child.mjs`, a child process that acquires `acquireLock`/`createOrReuseApplyWorktree` and announces its pid, token and worktree.
- [x] 1.2 Add `test/fixtures/lock-child-runner.mjs`, a parent-side spawner that separates the child's first line from its clean exit.

## 2. Cross-process exclusion

- [x] 2.1 Assert in `test/worktree-lock.test.mjs` that a second process cannot acquire a change lock held by another pid, and that the lock is gone after the child releases it.
- [x] 2.2 Assert in `test/worktree-create.test.mjs` that a child reacquires a dead owner's free lock and the state's `lockToken`/`lockPid` are replaced.
- [x] 2.3 Assert in `test/worktree-create.test.mjs` that one change's in-flight worktree creation neither blocks another change's reuse nor another change's creation, and takes no lifecycle lock.

## 3. Real session-move failures

- [x] 3.1 Replace the missing-agent setup in the three session-move tests with a Host whose move fails with `EACCES` on a read-only worktree.
- [x] 3.2 Assert the worktree, created branch, seal branch, seal ref, state, lock and cwd after each rollback.

## 4. Verify

- [x] 4.1 Run `node --test test/worktree-lock.test.mjs test/worktree-create.test.mjs`: 37 tests pass, 0 fail.
- [x] 4.2 Confirm the new assertions fail when the corresponding guard is removed: a foreign-pid steal in `acquireLock` fails the cross-process lock test, dropping the `updated !== existing` state write fails the dead-owner test, and skipping the created worktree/branch cleanup fails the session-move test.
- [x] 4.3 Run `/tmp/b3/gates.sh test-worktree-cross-process` after the implementation commit: strict validate, `openspec:check` (119 items), requirement length, generated skills and `check:pr` pass; `npm run verify` passes 1434 tests on Node v24.22.2 with coverage 98.63% line, 93.70% branch, 99.21% function and no violations.
