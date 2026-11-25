# Tasks: Guard the archive commit scope

## 1. Land index precondition

- [ ] 1.1 Add an empty-index check to `lib/worktree/land.js` in the land preconditions, before the state becomes `landing` and before `git merge --ff-only`; verify with a new flow test that a staged foreign path refuses, main does not move, the state stays `active`, and the staged path remains in the index.
- [ ] 1.2 Document the empty-index precondition in `docs/apply-worktree.md`; verify the documented command and diagnostic match the implementation.

## 2. Archive commit scope

- [ ] 2.1 Add the pre-staging empty-index refusal and the post-staging scope verification to `commitArchive`, using `git diff --cached --name-only --no-renames -z` and relative prefixes that refuse an empty, absolute or `..`-escaping path; verify with flow tests for a non-empty index, an out-of-scope staged path and an empty staged set, and a unit test for the exported classifier covering an allowed path, a foreign path, both sides of a rename and an empty list.
- [ ] 2.2 Add a regression test that an untracked planning file under another change's directory does not block land, remains untracked after the land, and is absent from the archive commit; verify with `git status --porcelain` and `git show --name-only <archiveCommit>`.
- [ ] 2.3 Document the archive commit scope and the out-of-scope refusal in `docs/apply-worktree.md` and the `docs/land-push.md` troubleshooting table, and update the existing sentence that says a failed archive or commit keeps the worktree for a retry so it names the mixed `git reset` step; verify each documented recovery command runs as written.
- [ ] 2.4 Extend the failed-archive-commit test: after the failed commit, a retry refuses and names the staging; a mixed `git reset` unstages it; the next retry commits once, marks the state `archived` and leaves a single archive commit; verify the test asserts each step.

## 3. Resumed archive commit

- [ ] 3.1 Verify an archive commit already on main in `findLanding` for both detection forms: derive exactly one archived directory named `<date>-<change>` or the change name when it already carries a date prefix from the commit's added `openspec/changes/archive/` paths, list the commit's paths with `--no-renames -z`, and allow only that directory, `openspec/specs` and the removed source change directory; add the shared exact resolver for the resume path that stages an interrupted archive; verify with tests for a compliant legacy archive, an out-of-scope path, a directory-less commit, more than one added archived directory, a commit that adds only another change's archived directory, and a missing or ambiguous directory before staging, each keeping the state `landing` on refusal.
- [ ] 3.2 Document the resumed-commit verification and the recovery for a missing or ambiguous archived directory in `docs/apply-worktree.md`; verify the documented inspection and restore steps.

## 4. Integration verification

- [ ] 4.1 Run `openspec_inspect` with `action: "validate"`, `change: "guard-archive-commit-scope"` and `strict: true`, then `npm run test:affected -- lib/worktree/land.js` and `npm run verify` on Node 24; verify all three pass.

## Workflow follow-up

- After archive, repack with `npm run bundle:pack -- --force`, reinstall the tarball through the Plugins page and restart the session so the installed copy runs the fix.
- Verify the installed copy refuses a staged out-of-scope path on the next land attempt.
