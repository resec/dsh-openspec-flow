# Proposal

## Why

An apply review's `retry` and `replace` return `openspec_review action=wait` without the review kind, and `wait` defaults to the draft record. An agent that follows the next action watches the draft round, so the apply review never resumes; the same file already names the kind for the apply wait in two other places.

## What Changes

- Return `openspec_review action=wait review=apply` from `retry` and `replace` when the record is an apply review; the draft path keeps the unqualified action.
- Add a test that writes an apply record with a reviewer slot and asserts both results.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The action names the same step with the kind it already uses elsewhere, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: the two next actions.
- `test/review-reviewer.test.mjs`: one new test.
- No schema, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
