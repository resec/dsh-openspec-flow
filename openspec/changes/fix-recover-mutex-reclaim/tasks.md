# Tasks

## 1. Reclaim a dead recover mutex

- [x] 1.1 Read the `<lock>.recover.d` owner when the mutex already exists, and refuse a live or unusable mutex as before.
- [x] 1.2 Move a dead mutex aside, delete it only when the moved directory still holds the observed token and pid, and retry the mutex once.
- [x] 1.3 Keep a live or changed mutex that was moved aside by renaming it back.

## 2. Report the mutex

- [x] 2.1 Return the mutex path, state, owner and reason from `inspectApplyLocks`.
- [x] 2.2 Declare the field in the `openspec_inspect` worktree schema and report a dead or unusable mutex as a `manual` repair without deleting it.

## 3. Tests and documents

- [x] 3.1 Cover recovery after a dead-pid mutex, the live-pid refusal, the changed-owner reclaim and the inspection report.
- [x] 3.2 Update `docs/apply-worktree.md` and `README.md` and guard the new text in `test/apply-worktree-doc.test.mjs`.

## 4. Verify

- [x] 4.1 Confirm the new tests fail with the implementation stashed (`git stash push -- lib/worktree/lock.js lib/tools/query.js`).
- [x] 4.2 Run `node --test test/worktree-lock.test.mjs test/worktree-inspect.test.mjs test/apply-worktree-doc.test.mjs`.
- [x] 4.3 Run `/tmp/b3/gates.sh fix-recover-mutex-reclaim` from the clone root.
