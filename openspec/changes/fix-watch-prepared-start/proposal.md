# Proposal

## Why

A head that was prepared and never reviewed was still reported as resumable. `filterCandidates` set `resume: true` for any recorded head whose SHA matched, without asking whether a review round existed for it. When the session stopped between `prepare` and the first `openspec_review action=start` (a timeout, a failed status call), the next poll re-emitted the head with `resume: true`; the documented prompt then reads the retry branch, finds no report and records `state --fail`. The head failed forever and only an operator `state --forget` cleared it.

## What Changes

- Classify a re-emitted head from the shared apply review record: `resume` is true only when a recorded round reviewed the prepared head's tree.
- Keep re-emitting a prepared or failed head, and emit a head without a record for its first start instead of a resume.
- Document the prepared-without-record branch in the `docs/pr-review.md` session flow so the session starts the first round instead of recording a failure.
- Cover the start, resume and new-head cases in `test/pr-review-watch.test.mjs`, with a documentation keyword assertion for the new branch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The polling requirement already re-emits a prepared or failed head for retry and the idempotency requirement already keeps that retry from opening a new round; only the candidate's `resume` flag and the prompt misread an unstarted head as a resumable round, so this change sets `skip_specs: true`.

## Impact

- `scripts/pr-review-watch.mjs`: the candidate classification and its review-record lookup.
- `docs/pr-review.md`: the session flow branch for a prepared head without a record.
- `test/pr-review-watch.test.mjs`: the prepared/failed assertions and the documentation assertion.
- No dependency, `dist/`, workflow, hook, coverage-baseline or `pr-review-land.mjs` change.
