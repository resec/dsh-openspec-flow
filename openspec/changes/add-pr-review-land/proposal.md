## Why

The pull-request watch stops at a review comment. Merging and archiving are still manual, and this repository keeps `main` linear: external pull requests are merged with a rebase, and the archive commit must follow the merged change. The maintainer needs a deterministic, label-authorized landing step that reviews the final rebased PR branch, merges it with `gh pr merge --rebase`, verifies the merged tree, archives on `main`, and pushes the archive commit.

## What Changes

- Add a repository-side landing script for reviewed pull requests. It prepares a local rebased PR branch, records the landing state, verifies the final review tree, merges with `gh pr merge --rebase`, fast-forwards the local `main`, verifies the merged tree, and finishes the archive/push handoff.
- The `mergeable` label is the sole landing authorization. Only a maintainer adds it; the automation reads it and never creates or removes it.
- The final apply review runs on the rebased PR branch, not on `main`. When the PR is behind `main`, the landing branch is rebased onto the current `main` first; a rebase conflict stops the landing, keeps the pull request open, and never changes the contributor branch.
- The merge uses `gh pr merge --rebase`: no squash, no merge commit, no `--admin`, no force.
- After the merge, the script verifies that the merged `main` tree equals the reviewed tree. Only then the session runs `openspec_archive` on `main`, commits the archive, and pushes. Archive failure is recorded as a retryable landing state because the pull request is already merged.
- Document the commands, state, schedule prompt, and recovery in `docs/pr-review.md`, `CONTRIBUTING.md` and `AGENTS.md`.
- Add tests for gates, rebase conflicts, label authorization, tree mismatch, merge and push failures, and idempotent retries.
- Out of scope: changing the review loop's comment format, auto-adding labels, executing PR code, and rewriting the plugin's review tools.

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:
- `pr-review-pipeline`: adds the label-authorized landing phase, rebased-branch review, `gh pr merge --rebase`, merged-tree equality, and archive/push state.
- `contributor-workflow`: the maintainer may delegate merge and archive to the watch after the `mergeable` label; the final apply review is on the rebased PR branch and the archive commit follows on `main`.
- `development-workflow`: external contributions now include the label-authorized landing gate and the post-merge archive check.

## Impact

- New `scripts/pr-review-land.mjs`; small shared exports or helper use from `scripts/pr-review-watch.mjs`.
- `docs/pr-review.md`, `CONTRIBUTING.md`, `AGENTS.md`.
- `package.json` entrypoint for the landing command.
- New `test/pr-review-land.test.mjs`; existing `test/pr-review-watch.test.mjs` remains unchanged.
- No plugin runtime, dependency, review-record schema or tool-surface change.
