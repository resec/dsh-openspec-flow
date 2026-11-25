# Proposal

## Why

`resume` reuses the latest round while it has no report and its object is unchanged. Every reuse path wrote the round's `startedAt` again, and `wait` derives the deadline from `startedAt` plus `waitMinutes`. After `wait` returned `overdue`, one `resume` moved the deadline a whole wait limit into the future, `extensions` stayed empty and no user approval was recorded. Repeating `resume` never timed out, which bypassed the approval that `extend` requires.

## What Changes

- Keep `startedAt` when `resume` reuses an unreported round: the draft reuse path and the apply normal and extra round paths.
- Keep the wake rule as it is: a reused round does not wake the reviewer again, as the review spec requires.
- Add wait tests for draft, apply and apply extra rounds: overdue, then `resume`, then `wait` still overdue with the same `startedAt`, `extensions` and limits.
- State the rule in the review document.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already requires `resume` to reuse an unreported round whose object is unchanged (`Resume continues a recorded review`), forbids waking the reviewer again for it (`Each review round wakes the reviewer`), ties the deadline to that round's `waitMinutes` (`The wait deadline wakes the changer`) and makes `extend` with `approvedBy: "user"` the action that changes the wait limit (`Extend changes the wait limit`). Reusing a round therefore keeps its start; only the implementation did not, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: three reuse paths no longer write `startedAt`.
- `test/review-wait.test.mjs`, `test/review-doc.test.mjs`: new assertions.
- `docs/review.md`: one sentence in the wait timeout entry.
- No record schema, policy, tool schema, dependency, workflow, hook, coverage-baseline or `dist/` change.
