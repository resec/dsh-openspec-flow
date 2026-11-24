# Proposal

## Why

`completeMergedLanding` caught every post-merge failure other than `tree-mismatch` and wrote `archive-pending` with `merged: true`. When local main carried an unpushed commit, `gh pr merge --rebase` succeeded on GitHub but `git merge --ff-only origin/main` refused, so the state called the landing ready for archive although the merged tree had never been fetched or compared with the reviewed tree. The next scheduled run followed the `archive-pending` branch, archived the change on a local main that does not contain the pull request and pushed it.

## What Changes

- Record a new `main-sync-failed` phase when the pull request is merged but local main cannot be brought to `origin/main`, and name the recovery in the error text: align local main with `origin/main`, then re-run `merge` so the merged tree is checked; do not review again.
- Keep `main-sync-failed` in the open phases, out of the abandonable phases and out of `prepare`, so `candidates` refuses the pull request, archive and `abandon` refuse it, and a second landing cannot start.
- Describe the phase and its recovery in `docs/pr-review.md`, including the scheduled-session step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `pr-review-pipeline` already requires `merge` to fast-forward local main and compare `HEAD^{tree}` with the reviewed tree after the merge, and requires archive to run only after a matching merged tree. Only the failure phase was wrong, so this change sets `skip_specs: true`. The tree-mismatch recovery stays out of scope; it is decided separately.

## Impact

- `scripts/pr-review-land.mjs`: the post-merge phase, the error text and the phase sets.
- `test/pr-review-land.test.mjs`: the diverged-main case now expects `main-sync-failed`; a new case covers an unpushed local commit across phase, error, archive, abandon, `candidates` and the retry after syncing.
- `docs/pr-review.md`: the landing failure paragraph, the phase list and the session step.
- No dependency, workflow, hook, `dist/`, manifest or coverage-baseline change.
