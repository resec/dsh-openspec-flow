# Proposal

## Why

`renderReportContract` built the `verifications` example from the first recorded finding whose status is `open` or `fixed`, and always listed `verified-fixed | still-open | regressed` as its status options. `report.js` refuses `verified-fixed` for any finding that is not `fixed`, so a reviewer who copied the example for an `open` finding submitted a report the validator rejected. The empty-findings branch also dropped the sentence the spec requires: verifications name only findings recorded before the round.

## What Changes

- Render the example's status options from the named finding's current status: `still-open | regressed` for an `open` finding, `verified-fixed | still-open | regressed` for a `fixed` one, and say in the surrounding line why `verified-fixed` is absent for an open finding.
- Add the earlier-findings sentence to the branch that starts with no recorded findings.
- Parse the example in a test and run the report validator over it, for both an `open` and a `fixed` finding.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

`change-review`: the report-contract requirement gets a companion requirement that the verification example offers only statuses valid for the named finding's status.

## Impact

- `lib/review/brief.js`: the verification line and the example.
- `test/review-reviewer.test.mjs`: one new test and one assertion on the empty branch.
- No payload, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
