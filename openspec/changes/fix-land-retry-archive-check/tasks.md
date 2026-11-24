# Tasks

## 1. Verify the archive commit

- [x] 1.1 In `lib/worktree/land.js`, accept the single commit after the branch tip as the archive commit only when its tree no longer contains the change directory; otherwise refuse with the recovery instruction before any lock is taken.
- [x] 1.2 Add a refusal case to `test/worktree-land.test.mjs` on the `readyLand({ feature: true })` fixture: an unrelated commit after the fast-forward keeps main `HEAD`, the `landing` state, the worktree, the branch and the change directory.

## 2. Spec and documentation

- [x] 2.1 Add the requirement `A landing retry verifies the archive commit` to the delta.
- [x] 2.2 Describe the verification in the land paragraph of `docs/apply-worktree.md` and guard it in `test/apply-worktree-doc.test.mjs`.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-land.test.mjs test/apply-worktree-doc.test.mjs`.
- [x] 3.2 With `lib/worktree/land.js` stashed, run the new case and confirm it fails.
- [x] 3.3 Run `/tmp/b3/gates.sh fix-land-retry-archive-check` from the clone root.
