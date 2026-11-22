# Proposal

## Why

Two `tool-surface` requirements and the tool's `action` description list nine of the thirteen actions `openspec_review` accepts: `wait`, `retry`, `replace` and `waive-reviewer` are missing even though the change-review capability requires them, and the draft requirement still says reviewer-subagent actions are withheld "until the independent reviewer is added" although the reviewer exists.

## What Changes

- Enumerate all thirteen actions in both requirements, in the parameter's own order.
- Remove the stale sentence about withholding reviewer-subagent actions.
- List the same thirteen actions in the `action` description.
- Add a test asserting the description names every value the parameter accepts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the two requirements that enumerate `openspec_review` actions are corrected to the thirteen accepted actions.

## Impact

- `openspec/specs/tool-surface/spec.md`: through the delta.
- `lib/tools/review.js`: one description string; `test/descriptions.test.mjs`: one test.
- No behavior, schema, dependency, workflow, hook, coverage-baseline or `dist/` change.
