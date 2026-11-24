# Tasks

## 1. Refuse before the fast-forward

- [x] 1.1 In `lib/worktree/land.js`, refuse before the planning copy is reconciled when the worktree `HEAD` is not the tip of the state's branch; name the branch and the worktree-side correction. Keep the post-merge comparison as the guard for a concurrent writer.
- [x] 1.2 Add two cases to `test/worktree-land.test.mjs`, a worktree behind its branch and one ahead of it, asserting the refusal, an unchanged main `HEAD`, an `active` state and the kept worktree and branch.

## 2. Spec and documentation

- [x] 2.1 Add the scenario `The worktree head is not the branch tip` to the MODIFIED `A failed land keeps a resumable state` requirement.
- [x] 2.2 Describe the refusal in the land paragraph of `docs/apply-worktree.md`.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-land.test.mjs test/apply-worktree-doc.test.mjs`.
- [x] 3.2 With `lib/worktree/land.js` stashed, run both new cases and confirm they fail.
- [x] 3.3 Run `/tmp/b3/gates.sh fix-land-verify-before-ff` from the clone root.
