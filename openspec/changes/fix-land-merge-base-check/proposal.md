# Proposal

## Why

`mergeLanding` checked "did main move" against the locally cached `origin/main` ref and dropped the `baseRefOid` that `gh pr view` had already returned. When another pull request advanced main on GitHub and the local ref was not fetched, the check passed, `gh pr merge --rebase` ran, and only the post-merge tree check reported `tree-mismatch`, by which time main carried a tree nobody had reviewed. The merge command also ran without `--match-head-commit`, so the head could change between the check and the merge.

## What Changes

- `merge` compares the base tip GitHub reports (`baseRefOid`) with the recorded pre-merge main instead of the local tracking ref.
- The refusal names the recovery action (a fresh prepare and review) and does not call `gh pr merge`.
- `merge` passes `--match-head-commit <head>` with the reviewed head.
- `plan` output gains `baseRefOid`; `docs/pr-review.md` describes both rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: "Main moved before merge" keys on the base tip GitHub reports, also when the local tracking ref is stale; a new requirement pins the reviewed head with `--match-head-commit`.

## Impact

- `scripts/pr-review-land.mjs`: `evaluateLanding` returns `baseRefOid`; `mergeLanding` compares it and adds `--match-head-commit`.
- `test/pr-review-land.test.mjs`: the fake `gh` records merge arguments; the moved-main case no longer fetches; one new case asserts the merge flags.
- `docs/pr-review.md`: the `merge` step of the landing sequence.
- No fetch is added before the comparison: the spec asks `merge` to fetch after the merge only, and the base tip comes from GitHub.
