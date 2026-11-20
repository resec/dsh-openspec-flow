# Design: Push landed main explicitly

## Context

See [proposal.md](proposal.md) - Why. A worktree land already verifies the merged tree, archives the change, commits the archive and writes `<git common dir>/openspec-flow/landed/<mergeCommit>.json`; it never pushes. The manifest carries `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `mergeCommit`, `mainHead`, `archiveCommit`, `applyReviewId`, `reviewRecordHash`, `approvedBy` and `landedAt`. The repository-side push step has no verifier today.

## Goals / Non-Goals

Goals:

- Verify a landed manifest and main before any push.
- Make the default a dry run and `--push` an explicit maintainer action.
- Keep the push to `main` only and keep the pre-push hook in charge.
- Work without reading plugin state, review records or worktree directories.

Non-goals:

- No plugin code, plugin state, manifest format or land behavior change.
- No automatic push after land.
- No tag, branch, force or history rewrite.
- No landed-manifest retention policy beyond the existing one file per merge.

## Decisions

### Manifest is the source of truth

The script reads only `<git common dir>/openspec-flow/landed/*.json`. It does not read apply state or review records, because land removes the worktree and clears the rebase marker; the manifest is the durable record of the landed merge and archive commit. Selection defaults to the latest `landedAt`; `--change`, `--merge` and `--manifest` narrow it. Multiple matches are an error rather than an arbitrary pick.

Alternative: derive the range from `HEAD` and `origin/main`. Rejected because it cannot prove the merge tree or the archive-only diff.

### Keep the repository's planning-file exemption

The push script is the last step of the same workflow that already lets several changes hold draft reviews. Its clean check ignores uncommitted paths under `openspec/changes/` directories other than the landed change's own directory, matching `filterUnrelatedChangeStatus` used by land. It still refuses an uncommitted path under the landed change's own directory or outside `openspec/changes/`. Without this exemption, a valid land would be unpushable until every other draft's planning files were committed, and committing them would move `HEAD` past `archiveCommit`.

Alternative: require a completely clean tree. Rejected because it contradicts the main specs and the workflow's concurrent draft reviews.

### Require `HEAD` to equal `archiveCommit`

A manifest proves one landed sequence: merge commit, archive commit, then push. If main has moved past that archive commit, the push would include commits the selected manifest never covered. The script refuses and asks for the latest manifest. A later land writes a newer manifest, so the latest landed record still pushes the full current main.

Alternative: allow `HEAD` to descend from `archiveCommit` and verify only the selected manifest. Rejected because the unverified suffix would be pushed without a manifest that covers it.

### Verify the merge tree and the archive-only diff

`git rev-parse <mergeCommit>^{tree}` must equal `featureTree`. The diff from `mergeCommit` to `archiveCommit` may only touch `openspec/changes/archive/`, `openspec/specs/` and deletions under `openspec/changes/<change>/`; anything else means the archive commit carries implementation or unrelated changes. This re-derives the land invariants from the manifest instead of trusting the tool result.

Alternative: trust `approvedBy` and the plugin's exit status. Rejected because the push script is the last gate before publishing.

### Fixed `origin`, dry run fetches, explicit push

The remote is the repository's `origin`; there is no remote-selection flag. The order is local validation, then `git fetch origin main`, then the remote decision, then an optional `git push origin HEAD:refs/heads/main`. The dry run performs the fetch too, so it reports the real remote state, but it never pushes. Equal is a no-op, remote ancestor is pushable, remote ahead or diverged is an error, and a missing `origin/main` is an error. The push uses no `--force` and no `--no-verify`, so the repository pre-push hook still runs. A second invocation is idempotent.

Alternative: push first and inspect the rejection. Rejected because it contacts the remote before the local facts are settled and gives worse diagnostics.

### Human output, standard exit codes

Human output names the manifest, commits, validation results and next action. Exit codes are 0 for success or already pushed, 1 for a refused check or remote failure, and 2 for usage errors. No machine-readable mode is added.

## Risks / Trade-offs

- [Manifest forged or stale] → Field validation, commit ancestry, tree equality and archive-only diff; the script does not accept a manifest whose commits are not reachable from `HEAD`.
- [Main moved after land by a non-land commit] → Strict `HEAD == archiveCommit` refusal names the condition; the maintainer lands the next change or reconciles deliberately.
- [Remote fetch races] → Fetch immediately before the decision; a push rejection remains the final arbiter and the script reports it.
- [Missing pre-push hook] → The script does not bypass hooks; a fresh clone still needs `npm run hooks:install`. The document names that prerequisite.
- [Pre-push hook is slow] → The hook is intentional; a dry run does not trigger it.
- [Test repositories need a bare remote] → Tests create a local bare origin and use real git commits; no network.

## Migration Plan

Additive. Nothing changes for an existing landed manifest; the script reads the current format. Rollback is deleting the script, tests, package script and docs; no stored data or plugin state is involved.

## Open Questions

None.
