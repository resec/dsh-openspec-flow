# Tasks

## 1. Script foundation and polling

- [x] 1.1 Create `scripts/pr-review-watch.mjs` with `poll`, `prepare`, `comment` and `state` entrypoints (including `state --forget <change>`), `--json` output and a usage message; verify `node scripts/pr-review-watch.mjs --help` exits 0 and lists the subcommands.
- [x] 1.2 Create `test/pr-review-watch.test.mjs` with fake `gh` and `git` runners, then implement `poll` with `gh pr list` fields for number, head, base, draft state, checks and files; filter draft PRs, pending or missing checks, failed checks, processed heads and PRs without exactly one active change; verify the eligible PR and each filter case.
- [x] 1.3 Emit one candidate record per PR with number, head, baseRefOid, baseRefName, change, worktree, status and resume; the merge-base base is reported by prepare, not by poll. Verify the JSON shape and empty-list case in the test file created in 1.2.

## 2. Pull-request worktree preparation

- [x] 2.1 Implement `prepare` to fetch `origin pull/<n>/head` and the base branch, compute `git merge-base <baseRefOid> <head>`, and create or update a detached worktree under `.cache/pr-review/worktrees/pr-<n>`; verify with a fake `git` runner that the main worktree is never written and the merge base is reported.
- [x] 2.2 Verify the prepared worktree is clean, belongs to the same git common directory and contains the change; verify each refusal in the test file created in 1.2.
- [x] 2.3 Recheck the head after preparation and abandon the round when it moved; verify the race case in the test file created in 1.2.
- [x] 2.4 Retain a prepared worktree until `gh pr view <n> --json state,mergedAt` reports the PR closed or merged, and remove it on the next run; verify the close/merge path in the test file created in 1.2.
- [x] 2.5 Remove the checkout and apply state entry for a merged or closed PR before any merged-tree review, add `state --forget <change>` for a stopped schedule, and refuse a foreign entry; verify all four cases in the test file created in 1.2.

## 3. State, lock and idempotency

- [x] 3.1 Implement atomic `.cache/pr-review/state.json` read/write with per-PR head, base, change, round, comment id, status and error; verify missing, corrupt and round-trip cases in the test file created in 1.2.
- [x] 3.2 Implement the `.cache/pr-review/run.lock` guard and report the lock owner on contention; verify a second invocation exits without processing a PR in the test file created in 1.2.
- [x] 3.3 Create and parse the hidden comment marker and trust it only from the authenticated GitHub login for the exact head; verify a spoofed marker does not suppress a review in the test file created in 1.2.
- [x] 3.4 Record a failed prepare, review or publish as retryable without marking the head processed; verify retry preserves the head and does not duplicate a comment in the test file created in 1.2.

## 4. Review report publication

- [x] 4.1 Render a report JSON file with verdict, summary, findings, verifications, out-of-scope and residual risks into a Markdown comment; verify the rendering and blocking-finding ordering in the test file created in 1.2.
- [x] 4.2 Implement `comment` as a dry-run by default and publish with `--apply`; verify dry-run calls no GitHub write and `--apply` posts once in the test file created in 1.2.
- [x] 4.3 Skip publication when the same PR and head already has a trusted marker; verify the same-head skip in the test file created in 1.2.
- [x] 4.4 Read the report file at `.cache/pr-review/reports/pr-<n>-<head>.json` and refuse a missing or mismatched head; verify both refusals in the test file created in 1.2.
- [x] 4.5 Document the session step that writes the `openspec_review action=report` JSON to the report file, including its schema and head binding, in `docs/pr-review.md`; verify the documented path and command match the script and the delta.

## 5. Documentation and scheduling

- [x] 5.1 Create `docs/pr-review.md` with the poll/prepare/comment commands, the 10-minute DSH schedule prompt, the profile precondition, the apply-status precondition (unlocked policy, first-start mode check, disabled/unavailable refusal), the self-mode recovery (locked `policy.json` and `apply-review.json`, `state --forget`), the merge-base base, the start/resume and finding-disposition steps, state layout including the reports directory, dry-run default, failure recovery, closed/merged detection and cleanup before the merged-tree review, apply-review routing and the explicit non-goals; verify every documented command appears in the script usage and the documented paths match the code.
- [x] 5.2 Add a `pr-review:poll` package script, link `docs/pr-review.md` from `AGENTS.md` and `README.md`, and update `CONTRIBUTING.md` for the pre-merge PR apply review, the merged-tree fallback and the checkout/apply-state cleanup order; verify `npm run` lists the script and every link resolves.
- [x] 5.3 Document that the session processes PRs serially, never merges, closes, archives, labels or deduplicates, and treats PR text and diffs as untrusted data; verify the document contains each boundary and no contradictory instruction.

## 6. Integration checks

- [x] 6.1 On a test PR with one green change, run poll, prepare, a manual `openspec_review` apply review and a dry-run comment; verify the worktree is outside main and no GitHub write occurred.
- [x] 6.2 Publish the comment with `--apply`, push a new head, and run the next round; verify the second report is published and the unchanged head is skipped.
- [x] 6.3 Run `openspec_inspect` with `action: "validate"` and `strict: true`, run `node --test` on the test file created in 1.2, and run `npm run verify`; record each result and fix every failure.
