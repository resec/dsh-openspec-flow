# Tasks

## 1. Seal construction

- [ ] 1.1 Add a module helper that builds the seal commit with a temporary index: `read-tree` the main `HEAD`, add the change directory and the plugin-written uncommitted root `.gitignore`, `write-tree`, then `commit-tree` with the main `HEAD` as parent; verify unit tests in `test/review-seal.test.mjs` cover the staged path set and that `main`'s `HEAD`, index and working tree are unchanged.
- [ ] 1.2 Replace the committed-`HEAD` path check in the git worktree seal with a changed-path check on the constructed commit: at least one file under the change directory, no changed path outside the change directory and that ignore file, and change artifacts whose blob hashes equal the draft record; verify tests for the accepted seal, the uncommitted ignore file, and each refusal (dirty path outside the allowed set, empty change directory, artifact mismatch) and that a refusal creates no ref or branch.
- [ ] 1.3 Create the apply branch and `refs/openspec-flow/seal/<slug>-<hash>` at the seal commit before writing `applyBaseCommit`; verify `test/review-apply.test.mjs` shows the record carrying the commit, the refs existing, `main`'s `HEAD` unchanged, and a safe ref name for `release..1` (slug `release--1`) and a leading-dot store id.
- [ ] 1.4 Rebase the apply branch onto a newer main in a test, assert the branch seal is rewritten, the recorded base is still reachable from the ref, and an apply review round diffs from the recorded base; verify in `test/review-apply.test.mjs`.
- [ ] 1.5 Keep the committed-`HEAD` seal for the worktree-disabled git path and the no-seal behavior for a non-git project; verify `test/review-apply.test.mjs` covers both compatibility paths, that the git worktree seal accepts its own uncommitted directory and ignore file, and that the worktree-disabled seal refuses the own directory.
- [ ] 1.6 Reset an apply branch left by a removed abandoned checkout to the new seal commit when no worktree uses it, reuse it only when its tip equals the seal, and refuse when a worktree is attached; verify `test/review-apply.test.mjs` covers apply, remove, a fresh draft and re-apply.

## 2. Worktree creation

- [ ] 2.1 Make worktree creation reuse the branch the seal created instead of deleting and recreating it, and keep the branch and the ref when creation fails; verify `test/worktree-create.test.mjs` covers branch reuse, a failed creation that leaves both, and a retry that constructs no second seal.

## 3. Resync

- [ ] 3.1 Skip the draft artifact read when apply started so a resync uses the recorded hash; verify a `test/review-apply.test.mjs` case removes the main change directory after apply started and still receives the apply state.

## 4. Land copy handling

- [ ] 4.1 Reconcile the main worktree's planning copy with the seal tree, including content and mode: remove matching untracked files under the change directory and the plugin-written root `.gitignore`, and restore a tracked `.gitignore` that is modified or deleted to its `HEAD` version before the clean-main check; verify `test/worktree-land.test.mjs` covers a matching copy, an untracked ignore file, a tracked modified or deleted ignore file, a modified copy refused with its path, and an unchanged tracked file left in place.
- [ ] 4.2 Restore the removed files from the seal commit when land fails before main is updated, and leave an absent or already merged copy alone; verify `test/worktree-land.test.mjs` covers the failure restore, the absent copy and the completed-merge retry.
- [ ] 4.3 Delete the seal ref on land success and on `remove` of an archived or explicitly abandoned checkout, tolerating a missing ref; verify `test/worktree-land.test.mjs` and `test/apply-worktree.test.mjs` cover each path and show no ref afterwards.

## 5. Policy, skill and documentation

- [ ] 5.1 Update `lib/policy.js` and `skills/openspec-apply-change/SKILL.md`: a git worktree apply seals on the apply branch without an agent commit, and the reviewed change directory and the plugin-written ignore file may stay uncommitted only on that path; a worktree-disabled git project keeps the committed-`HEAD` seal and its agent commit; verify `test/policy.test.mjs` and `test/check-generated-skills.test.mjs` pass with the new wording.
- [ ] 5.2 Update `docs/review.md`, `docs/apply-worktree.md`, `README.md` and `AGENTS.md` with the seal location, the private ref, the land-time copy handling including the plugin-written ignore file, the two seal commits after a rebase, the worktree-disabled seal and the stale-read caveat; verify `test/review-doc.test.mjs` and `test/apply-worktree-doc.test.mjs` assert the new statements.

## 6. Verification

- [ ] 6.1 Run `npm run test:affected -- lib/tools/review.js lib/worktree/create.js lib/worktree/land.js lib/tools/apply.js lib/tools/worktree.js`; verify the selected tests pass.
- [ ] 6.2 Run `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify both pass.

## Workflow follow-up

- Commit the implementation in the apply worktree and run the apply review.
- Land with `openspec_apply_worktree action=land`, then run `node scripts/push-landed.mjs` and `node scripts/push-landed.mjs --push`.
