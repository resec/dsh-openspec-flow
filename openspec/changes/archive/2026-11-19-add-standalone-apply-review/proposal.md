## Why

An external pull request arrives as a committed branch with the change artifacts and the implementation together. The maintainer needs to run one apply review on that branch, but the current apply entry requires a completed draft review, and its first write can create an untracked `openspec/.gitignore` in a worktree that does not already carry it. The first condition blocks the review; the second makes the clean-tree check fail on a later round. Both are review-tool assumptions about a local change lifecycle that an external pull request does not have.

## What Changes

- `openspec_review` accepts an optional `baseline` parameter for apply `start` and `resume`, with values `draft` (default when the draft policy is enabled) and `none`. With an explicit `baseline: "none"` the apply review skips the draft record, intent, plan-drift and plan-change-waiver checks, requires an explicit non-empty `base`, refuses a change that already has a draft record, and records `baseline: "none"` in the apply record. A draft-disabled policy resolves an omitted baseline to `none`, records that baseline and keeps its existing base fallback. The draft-enabled default path is unchanged and still requires a ready draft review.
- `ensureReviewIgnored` checks whether git already ignores the review directory before writing `openspec/.gitignore`. When the directory is already ignored, it writes nothing; otherwise it preserves the current behavior. This removes the untracked ignore file from worktrees covered by a repository-level rule.
- README and `docs/review.md` document the new baseline and the ignore behavior.
- Tests cover the new baseline path, its refusals, status projection, and the ignore check.
- Out of scope: no GitHub, remote, pull request, poller or comment logic in the plugin; no change to the default draft gate; no root `.gitignore` change (a separate repository change owns that).

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:
- `tool-surface`: `openspec_review` gains an optional `baseline` parameter and a dedicated requirement for the no-draft apply review path.
- `change-review`: standalone apply reviews run without a draft record and require an explicit base; the review ignore line is written only when git does not already ignore the review directory.
- `review-documentation`: the README row and the review document state the new baseline and ignore behavior.

## Impact

- `lib/tools/review.js`: parameter schema, tool and parameter descriptions, apply entry baseline handling, record creation/resume consistency, status projection, brief input.
- `lib/review/store.js`: `ensureReviewIgnored` gains a directory parameter and a git-ignore check.
- `lib/review/policy.js` and `lib/review/apply-lock.js`: pass the review directory to the ignore check.
- `lib/review/brief.js`: the apply brief states the no-draft baseline and the explicit base.
- Tests: `test/review-unit.test.mjs`, `test/review-apply.test.mjs`, `test/review-status-mode.test.mjs`, `test/review-lock.test.mjs` and the relevant fixtures.
- `README.md` and `docs/review.md`.
- No new dependency; the plugin remains plain ESM with Node built-ins only.
