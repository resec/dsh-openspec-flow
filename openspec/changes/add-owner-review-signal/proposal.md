## Why

A pull request that has passed review but still lacks the maintainer-applied `mergeable` label is invisible as work waiting for owner attention: its only queue is a review comment, and the maintainer must scan comments or re-check every PR. The watch deliberately never writes labels today, so it cannot mark that state.

An advisory `owner-review` label makes the queue explicit without changing the landing authorization. The label must track the current PR state, because a stale signal is worse than no signal: an author push, a `main` advance that produces a conflict, a failing check, or the arrival of `mergeable` must clear it.

## What Changes

- Add a repository-side owner-review command that adds `owner-review` only when every landing gate except `mergeable` passes, and removes it when that state stops being true.
- Add a reconcile mode that scans tracked pull requests and open pull requests carrying the label, backfills eligible labels, removes stale or orphaned ones, and records the labeled head in the watch state.
- Keep the label advisory: `owner-review` never authorizes landing, never gates `scripts/pr-review-land.mjs`, and never replaces `mergeable`.
- Limit automatic label writes to `owner-review`. The automation never adds or removes `mergeable`.
- Allow the session to maintain the advisory label while the contributor-workflow spec still requires the contributor branch and merge authorization to stay untouched.
- Update the scheduled-session prompt, commands, state and non-goals in `docs/pr-review.md`, and the maintainer-facing statements in `CONTRIBUTING.md` and `AGENTS.md`.
- Add dry-run support so an operator can inspect the add/remove plan before writing labels.
- Out of scope: changing landing gates, merging or archiving PRs, adding `mergeable` automatically, modifying contributor branches, executing PR code, and changing the plugin tool surface.

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:
- `pr-review-pipeline`: adds the advisory `owner-review` signal, its eligibility and invalidation rules, and reconciliation under the existing watch lock and state.
- `contributor-workflow`: allows the scheduled session to maintain `owner-review` while `mergeable` remains the only landing authorization.

## Impact

- New `scripts/pr-review-owner-review.mjs` and `test/pr-review-owner-review.test.mjs`.
- `scripts/pr-review-watch.mjs` gains the shared trusted-pass helper and preserves the optional owner-review state when a new head is prepared; `test/pr-review-watch.test.mjs` gains the preservation regression.
- `scripts/pr-review-land.mjs` re-exports the shared helper for its existing test import; its gates and behavior do not change.
- `package.json`, `docs/pr-review.md`, `CONTRIBUTING.md`, `AGENTS.md` and `test/contributor-docs.test.mjs`.
- `.cache/pr-review/state.json` entries may carry `ownerReview: { head, at }`; the state schema version stays 1.
- No plugin runtime, dependency, review-record schema or tool-surface change.
