# Proposal: clarify-apply-brief-base

## Why

The apply review brief names the commit, tree, base tree and diff, and its rules tell the reviewer to review the diff against the base tree and the whole current tree. It does not say what the base is, it does not name the three possible base sources, and it does not say that an empty diff can still mean the change is unimplemented. A reviewer can read the diff as the review scope and treat a tree that still equals the seal as ready.

The code already reads an explicit `base` argument, but the registered `openspec_review` parameter schema does not declare it. The explicit source would be specified and documented without being reachable through the tool.

## What Changes

- Add `- base: <reference>` to the apply brief header and a `## Base and diff` section before `## Changed paths`.
- Name the exact base source: the seal commit recorded by the first `openspec_apply_next`, an explicit base passed to the round, or `git merge-base HEAD origin/main`.
- State that the diff starts at the base tree and covers only what differs between the base tree and the committed current tree; the whole committed current tree remains the review object.
- State that an empty diff means the committed tree equals the base tree, not that the change needs no implementation, and ask the reviewer to check every task and delta requirement against the tree.
- Pass the resolved base reference and source from `applyReviewEntry` to `buildApplyBrief`; the base, tree and diff computations do not change.
- Declare the optional `base` string parameter with a description in the `openspec_review` schema; apply start and resume pass it to the existing base resolution, other actions ignore it, and blank values stay ignored.
- Update `docs/review.md`, the README `openspec_review` row, and add `change-review`, `review-documentation` and `tool-surface` spec requirements.

The only tool-contract change is the new optional `base` parameter. There is no new gate, no new tool error, and no record format or readiness change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `change-review`: two added requirements for the base reference and source label and for the diff scope and empty-diff meaning; two modified requirements update the existing base scenarios to include an explicit base.
- `review-documentation`: two added requirements, one for the `docs/review.md` statement and one for the README `openspec_review` row.
- `tool-surface`: one added requirement that `openspec_review` declares the optional `base` parameter and ignores a blank value.

## Impact

- `lib/review/brief.js`, `lib/tools/review.js`
- `docs/review.md`, `README.md`
- `test/review-reviewer.test.mjs`, `test/review-apply.test.mjs`, `test/review-doc.test.mjs`
- No dependency, record format, readiness or gate change beyond the optional `base` parameter.
