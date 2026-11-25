# Proposal

## Why

`waive-reviewer` records `reviewerWaived` with the slot, the reason, the waiver text, the approver and the time, but not the round it was approved for. Readiness then treats the presence of that record as the waiver itself: while it exists, the missing-report check and the verdict check are both skipped for the whole change. After the artifacts change and `resume` opens the next round, a report with verdict `blocked`, or `changes-requested` once its finding is disposed, still reports the review ready, and a round with no report at all makes `wait` return `ready` with `openspec_apply_next`. `wait` and the wait deadline use the same presence check, so the later round is never waited on.

The requirement "A waived reviewer is a coverage gap" says the waiver skips the missing-report requirement and still requires a passing verdict from the remaining review content. It does not say the waiver outlives the report it was approved for.

## What Changes

- Record the round number and the object hash of the unreported round in `reviewerWaived` when the user approves the waiver.
- Let the waiver skip only the missing report of that round on that object. The verdict check runs whenever the latest round has a report, on the waived round as well as on a later one.
- Treat a later round, or the same round bound to another object, as unwaived in readiness, in `wait` and in the wait deadline: it needs its own passing report, `wait` returns `waiting` or `overdue`, and the deadline wakes the changer.
- Keep the existing behavior for a round opened after a waiver: `resume` wakes the slot reviewer for it and arms the draft round watch. A waiver recorded before it carried its round keeps the scope it was approved under.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the requirement "A waived reviewer is a coverage gap" names the round and object the waiver covers, states that a later round needs its own passing report, and adds the scenarios for a later verdict, a later missing report, a late report on the waived round and the wake of the later round.

## Impact

- `lib/review/readiness.js`: one helper decides whether the waiver covers the latest round; the verdict check no longer depends on the waiver.
- `lib/tools/review.js`: `waive-reviewer` records the round and object hash; `wait` and the deadline callback use the helper.
- `test/review-unit.test.mjs`, `test/review-reviewer.test.mjs`, `test/review-wait.test.mjs`, `test/review-watch.test.mjs`: the waiver scope over the readiness, submit, wait, deadline and watch paths.
- `docs/review.md`: the unavailable-reviewer row of the failure handling.
- A record waived by an earlier version has no round on its waiver and keeps covering its rounds; a record waived from this change on is scoped.
