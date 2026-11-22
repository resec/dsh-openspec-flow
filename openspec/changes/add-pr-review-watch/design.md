# Design: PR review watch

## Context

See [proposal.md](proposal.md) for the motivation and [specs/pr-review-pipeline/spec.md](specs/pr-review-pipeline/spec.md) for the behavior contract.

The plugin supports an external branch or PR checkout through `openspec_review`: an apply review can be started with `worktree`, an explicit `base`, `baseline: "none"` and the policy's reviewer mode. It writes an apply state that points at that checkout, keeps the review record under the shared review root, and never creates, moves or deletes the checkout. The missing part is repository-side orchestration: polling, worktree preparation, invoking the tool from a DSH session, publishing the report, reopening on a new head, and cleaning up the state the tool wrote.

The script cannot call the plugin tools. Only a DSH agent session can call `openspec_review`. The design therefore separates deterministic GitHub/git work from the model-driven review.

## Goals / Non-Goals

**Goals**

- A repeatable loop for open PRs with exactly one active change.
- A local PR checkout that is independent of the main worktree.
- An apply review on the committed PR head with a merge-base diff.
- A report comment that is idempotent per head.
- A new round after the author pushes a new head.
- Cleanup of the apply state that points at a removed PR checkout.

**Non-Goals**

- Issue watching, required issue links, duplicate detection, labels, closing, merging or archiving.
- Any plugin code, review-record schema or tool-surface change.
- Running PR install, test or build commands.
- Reviewing draft PRs, PRs with pending or no checks, or PRs without exactly one active change.

## Decisions

### Poll, prepare and publish in a Node script; invoke the review in a DSH session

`scripts/pr-review-watch.mjs` owns the deterministic parts: `gh pr list`, filtering, `git fetch`, merge-base calculation, worktree create/update, state, run lock, report rendering, `gh pr comment`, and apply-state cleanup. The scheduled DSH session owns `openspec_review` status, start/resume, finding disposition and the report handoff file.

This split is required because the plugin tools are Host tools, not a CLI. It also keeps the script testable with fake `gh` and `git` runners and keeps model calls out of the polling path.

### Detached worktree under `.cache/pr-review/worktrees/pr-<n>`

The script fetches `origin pull/<n>/head` and the base branch, computes `git merge-base <baseRefOid> <head>`, and creates or updates a detached checkout at the PR head. The base is the fork point, not the moving base tip. It never checks out in the main worktree and never changes the session working directory. The path is ignored through the repository's existing `.cache/` rule.

A separate checkout is required for `openspec_review`'s review-only path, which requires a linked checkout in the same git common directory, not the main worktree, clean and containing the change. The script verifies those conditions before reporting the path. It retains the checkout until the PR is closed or merged.

### Check apply mode, do not pass a reviewers argument

`openspec_review` has no `reviewers` parameter; the count is locked in the change's policy from the profile settings. The session must first call `openspec_review action=status review=apply` with the PR worktree. A change created by the CLI has no locked policy, so status reports `policy: false`; that is the normal first-run state, not a self-review configuration. The session starts the review, lets the first start lock the profile settings, then requires the returned mode to be `reviewer`.

When a policy already exists, status must report available, enabled and independent reviewer mode. The repository prerequisite is a profile with `reviews.apply.enabled: true` and `reviews.apply.reviewers: 1`; the maintainer confirms it before enabling the schedule. If the first start returns self mode, the session publishes no review, submits no self-report and reports the recovery: fix the profile, remove the change's locked `policy.json` and `apply-review.json` with user approval, run `state --forget <change>` to remove the apply state that names the PR checkout, then rerun; a fresh change name is the alternative. The call itself uses `review: "apply"`, `baseline: "none"`, the merge-base `base` and the PR worktree. `baseline: "none"` requires an explicit resolvable base and has no merge-base fallback, so the script computes and reports it.

### Fix prior findings as pending verification

`openspec_review` refuses a new round while a finding is open. On a new head the session disposes every open finding as `fixed` with a note that the new head awaits verification, then resumes. This does not claim the finding is fixed: the reviewer's `verifications` close it as verified-fixed or leave it blocking. Waivers remain a user decision and are not automated.

### Report handoff and comment marker

The session writes `openspec_review action=report` to `.cache/pr-review/reports/pr-<n>-<head>.json`. The script reads that file, refuses a missing or mismatched head, and renders the Markdown comment.

The comment carries a hidden marker:

```html
<!-- pr-review: pr=12 head=<sha> round=2 -->
```

Before publishing, the script reads existing PR comments and skips a marker for the same head when the comment author is the authenticated GitHub account. Checking the author prevents a PR author from suppressing review by pasting a marker into a normal comment. The command defaults to dry-run; only `--apply` writes to GitHub.

### State, lock, serial processing and apply-state cleanup

State lives in `.cache/pr-review/state.json` and is written atomically. A run lock prevents overlapping scheduled sessions. The session processes candidates one at a time so two reviewer sessions do not compete for model capacity. A failed prepare, review or publish leaves the head retryable; a published comment is never duplicated.

`openspec_review` writes the ordinary apply state under `<git common dir>/openspec-flow/apply/<change>.json` pointing at the PR checkout. While that state exists, `openspec_inspect action=validate`, `openspec_mark_task_done` and every apply review call (`status`, `resume`, `report`, `dispose`) for that change route into the PR checkout. When the script removes the checkout, it also removes that state entry, but only when the entry names the checkout being removed; a foreign state is reported and left untouched.

A tracked PR is checked with `gh pr view <n> --json state,mergedAt` rather than inferred from its absence from the open list. A merged or closed PR is cleaned up before the merged-tree apply review runs; otherwise a `resume` from main would re-review the PR head and never the merged tree. `state --forget <change>` performs the same cleanup for a tracked change when the schedule is stopped, and also refuses a foreign entry.

### Filter before review

Candidates must be non-draft, have at least one CI check with every rollup entry successful, change exactly one active change, and have an unprocessed head. Pending checks and no checks are not candidates. The filter is reevaluated immediately before preparation because a PR can move while the poll is running.

### Pre-merge review and final merged-tree review

The PR review runs on the PR head before merge. The archive gate binds an apply record to `HEAD^{tree}`, so when main advanced or the merge changed the tree, the PR record cannot satisfy archive. The modified `contributor-workflow` and `development-workflow` requirements state the fallback: reuse the PR review only when its reviewed tree equals the merged tree; otherwise remove the PR checkout and its apply state first, then run another apply review on the merged tree before archive. `CONTRIBUTING.md` documents both placements and the cleanup order.

## Risks / Trade-offs

- **A scheduled run exceeds the 10-minute interval** -> the run lock makes the next run exit; the state is retryable and the session processes one PR at a time.
- **The PR head moves during preparation** -> the script pins the head it validated, rechecks it after preparing, and abandons the round when it changed.
- **A marker is spoofed in a comment** -> markers are trusted only from the authenticated GitHub login and only for the exact head.
- **State is lost** -> comments and the PR head are the recovery source; a missing state may cause one extra review, not a merge or a close.
- **The author only comments without pushing** -> no new round starts; the loop is head-driven.
- **A review never becomes ready** -> the session reports the blocking report and stops; it does not waive findings or merge.
- **The PR checkout outlives the review** -> the script removes the matching apply-state entry with the checkout; a foreign entry is refused and reported.
- **GitHub API rate limits** -> the poll is read-only and bounded; failures are recorded and retried on the next run.

## Migration Plan

This is additive. It adds a script, a test, a document and a package entrypoint; it modifies two workflow specs and their contributor-facing documentation. It does not change plugin code or existing review records. Rollback removes the package entrypoint and stops the scheduled task; existing PRs and review records are unaffected.

## Open Questions

None. Issue links, deduplication and automatic close are explicitly deferred to later changes.
