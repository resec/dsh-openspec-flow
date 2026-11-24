# Proposal

## Why

`disposeFinding` validated only the requested status and the finding's severity. A finding that was already `verified` or `waived` could therefore be disposed again: after a user waived `R1-01` (major), `dispose status=fixed` was accepted, the waiver fields were overwritten and the blocker counted as open again, so a passed draft review fell back to `in-review`.

## What Changes

- Refuse `action: "dispose"` and a finding `action: "waive"`, in the single `id` form and in a `dispositions` batch, when the named finding is already `verified` or `waived`.
- Refuse with the form of a refused verification: the error names the finding's current status, says it is closed and directs no further disposal.
- Leave the record unchanged on a refusal. A batch that names a closed finding writes none of its entries, as the batch contract already requires.
- Assert the refusal for both review kinds, and that a passed review stays passed.
- State the rule in `docs/review.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already defines the contract: "Draft findings carry severity and a lifecycle" lists `verified` and `waived` as the last states of the lifecycle, and "A refused verification reports the finding's current state" calls a finding that is already `verified` or `waived` closed and directs no further disposal for it. "Finding dispositions accept an atomic batch" already requires that an invalid entry leaves the record unchanged. Only the implementation lacked the precondition, so this change sets `skip_specs: true`.

## Impact

- `lib/review/report.js`: one precondition in `disposeFinding`. The batch entry in `lib/tools/review.js` already validates every entry before it writes, so it does not change.
- `test/review-unit.test.mjs`, `test/review-draft.test.mjs`, `test/review-apply.test.mjs`: the refusal for `verified` and `waived`, the batch atomicity and the unchanged record.
- `docs/review.md`: the disposition table gains the closed-finding rule.
- Transitions the spec does not define (`deferred` or `rejected` to another non-blocking status, re-disposing a `fixed` finding) are unchanged and left to the owner.
