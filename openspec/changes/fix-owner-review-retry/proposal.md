# Proposal

## Why

The owner-review spec requires a label write failure to leave review state unchanged and to be retried by a later reconcile. Reconcile inspects tracked pull requests plus open pull requests carrying the label, but cleanup dropped a closed pull request's watch entry as soon as `gh pr view --json state,mergedAt` reported it closed. When the remove-label write failed on a pull request that had just closed, the entry was gone by the next run: reconcile no longer listed the pull request and the label stayed on the merged pull request forever.

## What Changes

- Keep a tracked pull request whose `ownerReview` head is still recorded out of cleanup, because that field means the label is still on the pull request and its removal has not been confirmed.
- Reconcile then keeps finding the closed pull request through watch state and retries `gh pr edit --remove-label`; a success clears `ownerReview`, and the following cleanup drops the entry.
- Add a test that fails the first removal, runs cleanup between two reconciles, and asserts the retry succeeds once and is not repeated.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `pr-review-pipeline` already requires that a label write failure "SHALL be retried by a later reconcile" and that reconcile inspects tracked pull requests, so this change sets `skip_specs: true`; only the cleanup scope was wrong.

## Impact

- `scripts/pr-review-watch.mjs`: `cleanupClosedPullRequests` skips entries with a recorded `ownerReview`.
- `test/pr-review-owner-review.test.mjs`: one reconcile/cleanup/reconcile test.
- `docs/pr-review.md`: the cleanup step names the kept entry.
- No dependency, workflow, hook, coverage-baseline, `dist/` or spec change.
