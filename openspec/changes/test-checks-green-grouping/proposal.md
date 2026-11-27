# Proposal

## Why

`checksGreen` groups rollup entries by `workflowName` plus check name, and by status context name. The `pr-review-pipeline` spec requires that grouping, the `startedAt`-then-`createdAt` fallback and the rule that every entry sharing the latest start time must succeed, but the tests did not pin any of it: the only two-workflow case puts both entries at the same timestamp, so a key of just the check name still superseded the failure. Making `checkIdentity` ignore `workflowName` left `test/pr-review-watch.test.mjs` at 38/38 and `test/pr-review-land.test.mjs` at 58/58, and no test told a status context apart from a same-named check run.

## What Changes

- Add minimal-rollup cases to `test/pr-review-watch.test.mjs`:
  - a failed check in one workflow and a newer success in another, which must stay red;
  - a status context and a same-named check run, in both directions, which are separate groups;
  - an entry with only `createdAt`, an entry with no usable start time, and a zero `0001-01-01T00:00:00Z` start time;
  - several entries at the same latest start time, where one failure must fail the group.
- Keep the existing same-workflow superseded-failure case as the positive control.
- Assert a reason message on every case, so a failure names the rule that broke.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `pr-review-pipeline` already states the grouping key, the start time fallback and the same-time rule in "Superseded check entry", and "Green CI rollup" already requires a non-empty rollup whose newest entries succeeded; only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/pr-review-watch.test.mjs`: two shared timestamp constants and five cases.
- No production, spec, documentation, dependency, workflow, hook, coverage-baseline or `dist/` change.
