# Tasks

## 1. Check the worktree before reuse

- [x] 1.1 Read the recorded worktree's checked-out branch and refuse reuse when it is detached or on another branch.
- [x] 1.2 Refuse reuse when `git status --porcelain` reports uncommitted changes, naming them in the error.
- [x] 1.3 Keep the state, the lock, the checkout and the session untouched on either refusal.

## 2. Guard the reuse path

- [x] 2.1 Add detached, other-branch and dirty refusal cases to `test/worktree-create.test.mjs`, asserting the recorded state and the user's file survive and the session stays put.
- [x] 2.2 Keep the clean reuse case, including commits made on the apply branch.
- [x] 2.3 Confirm the three refusal cases fail against the previous reuse path.

## 3. Document the precondition

- [x] 3.1 State the reuse precondition in `docs/apply-worktree.md` and the resync note in `skills/openspec-apply-change/SKILL.md`.

## 4. Verify

- [x] 4.1 Run `node --test test/worktree-create.test.mjs test/apply-worktree.test.mjs test/skills.test.mjs` (43 tests pass).
- [x] 4.2 Run `/tmp/b3/gates.sh fix-reuse-apply-worktree`.
