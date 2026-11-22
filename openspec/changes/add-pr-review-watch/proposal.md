# Proposal: Add the PR review watch

## Why

Every external pull request now needs the same manual loop: check the PR list, create a local checkout of the PR head, run an apply review, write the report back as a comment, and repeat when the author pushes. The maintainer does this by hand, so feedback is delayed and the same work is repeated for every head. The repository needs a minimal, observable loop before any issue or deduplication policy is added.

## What Changes

- Add `scripts/pr-review-watch.mjs`, a repository-side helper that:
  - polls open pull requests and filters to non-draft PRs with at least one check and every check successful, exactly one active change and a head the script has not processed;
  - fetches the PR head and the base branch, computes the merge base of the base tip and the PR head, and creates or updates a detached worktree under `.cache/pr-review/worktrees/pr-<n>`;
  - reports the PR number, head, merge-base base, change and worktree path to the DSH session that runs the review;
  - reads the report JSON the session writes under `.cache/pr-review/reports/pr-<n>-<head>.json`, renders it as a pull-request comment with a hidden idempotency marker, and skips a trusted marker for the same head;
  - keeps a cursor, a run lock and per-PR state under `.cache/pr-review/`;
  - removes the apply state entry that points at a PR checkout when that checkout is removed, and provides `state --forget <change>` for the same cleanup when the schedule is stopped.
- Document the manual command and the 10-minute DSH schedule in `docs/pr-review.md`. The maintainer confirms the independent-reviewer profile prerequisite before enabling it and follows the documented self-mode recovery; the scheduled session reads apply status first, accepts the unlocked first-run policy by letting the first start lock settings and then requiring reviewer mode, refuses a disabled or non-independent review, and calls `openspec_review` with `baseline: "none"`, the merge-base `base` and the PR worktree.
- On the first head, the session starts the apply review. When the head changes, it disposes the previous round's open findings as `fixed` with a note that they await verification, then resumes the apply review and publishes the new report. It never waives a finding.
- Modify `contributor-workflow` and `development-workflow` so the pre-merge apply review and the final merged-tree apply review are one documented flow.
- Add script tests with fake `gh` and `git` runners, a package script for the poll entrypoint, and a CONTRIBUTING note for the PR review result.

Out of scope for this change:

- issue watching or required issue links;
- duplicate detection, labels, closing PRs or issues;
- automatic merge or archive;
- any plugin code, review-schema or tool-surface change.

## Capabilities

### New Capabilities

- `pr-review-pipeline`: the repository-side loop that polls open pull requests, prepares a PR worktree, runs an apply review on the PR branch, publishes the report, starts a new round after a head change, and cleans up the review state it created.

### Modified Capabilities

- `contributor-workflow`: review placement now includes the pre-merge apply review and the merged-tree fallback before archive.
- `development-workflow`: the review gates now include the pre-merge PR apply review and the final merged-tree apply review.

## Impact

- New: `scripts/pr-review-watch.mjs`, `test/pr-review-watch.test.mjs`, `docs/pr-review.md`.
- Modified: `package.json` for the poll entrypoint, `AGENTS.md`, `README.md` and `CONTRIBUTING.md` for the command, schedule and review placement; new delta specs for `contributor-workflow` and `development-workflow`.
- No `lib/` change, no new dependency, no review-record schema change, and no change to the `openspec_review` tool surface.
- The script never executes PR code; the review reads the committed PR tree.
