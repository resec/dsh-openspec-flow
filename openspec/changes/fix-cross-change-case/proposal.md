# Proposal

## Why

`anotherChangeInLocation` compared the change-name segment with `===` and matched the `openspec/changes/` segment with a case-sensitive pattern. On the default macOS and Windows filesystems `openspec/changes/Demo/proposal.md` is the reviewed change's own file when the change is `demo`, yet the check refused it as another change; conversely `OPENSPEC/CHANGES/other/x.md` is another change's path, yet the check did not see a change segment at all and accepted it. Both directions contradict the review spec.

## What Changes

- Fold case when matching the `openspec/changes/` segment and when comparing the change name, so a location resolving to the reviewed change is accepted and one resolving to any other change is refused.
- Fold case for the `archive` segment too, so an archived change is still named `archive/<name>`.
- Add the mixed-case inputs of both directions to the location matrix, and a report-level case for an upper-case `OPENSPEC/CHANGES/` location.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already requires a location naming the reviewed change to be accepted and any location carrying an `openspec/changes/` segment to be treated as a change location; only the comparison missed the case folding, so this change sets `skip_specs: true`.

## Impact

- `lib/review/scope.js`: the change-segment match and the change-name comparison.
- `test/review-unit.test.mjs`: location matrix and report validation cases.
- No payload, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
