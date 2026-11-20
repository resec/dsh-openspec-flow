# Tasks

## 1. Land verification and merge

- [ ] 1.1 Add the land lock handover (release the recorded apply lock, set state `landing`, lifecycle then fresh change lock, write fresh token/pid), verify the run-apply state writer records `lockToken`/`lockPid` and accepts `landing`, and verify the fresh lock token/pid is written to the state; add main/worktree cleanliness (other changes' planning files allowed), same-common-dir, worktree-contains-main, active-or-landing-state-names-this-worktree and required-tree checks; verify each refusal leaves main unchanged in `test/worktree-land.test.mjs`.
- [ ] 1.2 Resolve the required tree conditionally: a ready enabled apply review's `treeSha`, or the worktree head when the policy disables apply review or has no apply section; an enabled but unready review is refused; verify all cases.
- [ ] 1.3 Merge with `--no-ff`, verify the merged tree equals the required tree and abort to the pre-merge main on mismatch; verify a non-fast-forward worktree is refused before merge and a mismatch does not retain the merge.
- [ ] 1.4 Run `npm run test:affected -- lib/worktree/land.js`.

## 2. Archive in land

- [ ] 2.1 Extract the archive operation into a reusable implementation and call it from both `openspec_archive` and land without changing the tool result; add the lifecycle lock to `openspec_archive` and verify an interleaved archive waits for land.
- [ ] 2.2 Archive and commit inside the lifecycle section, then write the manifest and mark the state archived; verify the merge commit carries implementation/docs and the archive commit carries the archive/merged specs.
- [ ] 2.3 Define `reviewRecordHash` (SHA-256 of `apply-review.json`) and `mainHead` (pre-merge main); verify the manifest fields, including null apply-review fields without a review.
- [ ] 2.4 Verify archive failure, commit failure and manifest failure keep a resumable state and a retry does not merge or archive twice; verify land does not push.

## 3. Remove

- [ ] 3.1 Add `remove` with archived-or-abandon, `approvedBy: "user"`, reason, plugin-path, clean-checkout and change-lock guards; verify a PR worktree, an active checkout without approval and a dirty checkout are refused.
- [ ] 3.2 Verify an archived checkout is removed, its branch remains and its state is deleted.

## 4. Tool surface

- [ ] 4.1 MODIFY `openspec_apply_worktree` to expose `recover`, `land` and `remove`; add the land/remove result fields and refusal cases.
- [ ] 4.2 Verify the reviewer catalog still excludes `openspec_apply_worktree` and the tool catalog tests reflect the new actions.
- [ ] 4.3 Run `npm run test:affected -- lib/tools/worktree.js lib/tools/query.js`.

## 5. Documentation and integration

- [ ] 5.1 Update `docs/apply-worktree.md`, `docs/review.md`, `README.md`, `AGENTS.md`, the `openspec_apply_worktree` description, the apply/archive skills and `lib/policy.js` for land, archive-in-land, manifest, remove, no push and the two-commit sequence.
- [ ] 5.2 Run `npm test`, `npm run verify` and `npm run openspec:check` on Node 24.

## Workflow follow-up

- Apply review after committing the implementation.
- Land through the worktree; do not archive a worktree-applied change with `openspec_archive`.
