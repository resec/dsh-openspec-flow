# Tasks

## 1. Manifest discovery and validation

- [x] 1.1 Create `scripts/push-landed.mjs` with manifest discovery under `<git common dir>/openspec-flow/landed/`, latest-`landedAt` selection, and `--change`/`--merge`/`--manifest` selection; verify missing, unreadable, unmatched and ambiguous selections fail in `test/push-landed.test.mjs`.
- [x] 1.2 Validate the manifest shape and required fields (`change`, `featureTree`, `mergeCommit`, `archiveCommit`, `approvedBy`) and reject a non-user approval; verify each rejection in `test/push-landed.test.mjs`.

## 2. Main and commit checks

- [x] 2.1 Reject a non-`main` branch and a missing commit; verify each refusal and its diagnostic in `test/push-landed.test.mjs`.
- [x] 2.2 Implement the clean check so uncommitted paths under another change's `openspec/changes/<name>/` are ignored, an uncommitted path under the landed change's own directory is refused, and an uncommitted path outside `openspec/changes/` is refused; verify all three cases in `test/push-landed.test.mjs`.
- [x] 2.3 Require `HEAD` to equal `archiveCommit`, `mergeCommit` and `archiveCommit` to be reachable from `HEAD`, and the merge tree to equal `featureTree`; verify each refusal in `test/push-landed.test.mjs`.
- [x] 2.4 Require the `mergeCommit..archiveCommit` diff to touch only `openspec/changes/archive/`, `openspec/specs/` and deletions under the change's former directory; verify an implementation path is refused and a valid archive diff passes in `test/push-landed.test.mjs`.

## 3. Remote reconciliation and push

- [x] 3.1 Fetch `origin` main, treat an equal remote main as success without pushing, allow an ancestor remote to be pushed, and refuse a remote ahead, a diverged history or a missing `origin/main`; verify all five cases against a local bare origin in `test/push-landed.test.mjs`.
- [x] 3.2 Make the default a dry run that fetches but does not push, require `--push` for a push, invoke the repository pre-push hook without `--no-verify`, and keep the push to `HEAD:refs/heads/main`; verify the dry run leaves the remote unchanged, the explicit push advances it, a second run is a no-op, and a failing pre-push hook blocks the push in `test/push-landed.test.mjs`.
- [x] 3.3 Implement human-readable output and exit codes 0/1/2; verify the selected manifest and commit range appear and a usage failure exits 2 in `test/push-landed.test.mjs`.

## 4. Documentation and entry points

- [x] 4.1 Add `docs/land-push.md` covering the command, dry-run default, exit codes, selected fields, the `npm run hooks:install` prerequisite for the pre-push gate, checks, failure recovery and the no-auto-push boundary; verify the document names every refusal from tasks 1-3 and the hook prerequisite.
- [x] 4.2 Add `push:landed` to `package.json` and link `docs/land-push.md` from `AGENTS.md`, `README.md`, `docs/apply-worktree.md` and `docs/apply-worktree-dev.md`; verify the script entrypoint and each link resolve in the documentation tests.
- [x] 4.3 Update `AGENTS.md` step 7 to name the dry run, explicit `--push`, and the maintainer-only boundary; replace `docs/apply-worktree.md`'s out-of-scope push sentence with a pointer to `docs/land-push.md`; verify the documented commands match the implemented flags in `test/push-landed.test.mjs` or the documentation test.
- [x] 4.4 Update the README publish order to name `openspec_apply_worktree action=land` and the push script instead of a bare manual push; verify the section links `docs/land-push.md`.

## 5. Integration

- [x] 5.1 Run `npm run test:affected -- scripts/push-landed.mjs test/push-landed.test.mjs docs/land-push.md` and fix every failure.
- [x] 5.2 Run `openspec_inspect` with `action: "validate"` and `strict: true` and fix every finding.
- [x] 5.3 Run `npm run verify` on Node 24 and `npm run openspec:check` and confirm both pass.

## Workflow follow-up

- Commit the implementation in the apply worktree and run apply review.
- Land with `openspec_apply_worktree action=land` after the user requests it.
- Push main with `node scripts/push-landed.mjs` (dry run), then `--push`.
