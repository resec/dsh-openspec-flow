# Proposal

## Why

The apply review's readiness requirement already says that `ready` needs every drift file inside the plan-change waiver file set. `start` and `resume` enforce it: they compare the recorded draft artifact list with the current change directory and refuse the round when a drifted file has no waiver. `status` projected the record against the tree hash only, so a plan file edited after the review passed left `ready: true`, `state: passed` and `nextAction: openspec_apply_next` even though `resume` and archive both refuse that tree. The apply brief was equally silent: the drift never reached the readiness projection.

## What Changes

- Extract the drift and waiver comparison from `start`/`resume` into one helper (`planDriftState`), so the round gate and the status projection share a single judgment instead of two copies.
- Make apply `status` run that comparison for a `draft` baseline with the draft policy enabled, and pass the unwaived files into readiness.
- `draftReadiness` gains `unwaivedPlanFiles`: each file becomes a reason, and the next action is `openspec_review action=waive scope=plan-change`. An open finding still takes precedence, and status still writes no record.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already requires this: "Apply review uses the draft base and report lifecycle" says `ready` requires "every drift file inside the plan-change waiver file set", and "Apply review refuses an unwaived plan change" names the waiver as the remedy. Only the status projection missed it, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: `planDriftState` replaces the inline comparison in the apply start and feeds the apply status branch.
- `lib/review/readiness.js`: the optional `unwaivedPlanFiles` reasons and next action.
- `test/review-apply.test.mjs`: the drifted plan file after a pass, the waiver that clears it, and a `baseline: "none"` review that has no draft to compare.
- `test/review-doc.test.mjs` and `docs/review.md`: the status behavior.
- No record schema, dependency, workflow, hook, coverage-baseline or `dist/` change.
