# Proposal

## Why

Two `tool-surface` requirements and the tool's `action` description list nine of the thirteen actions `openspec_review` accepts: `wait`, `retry`, `replace` and `waive-reviewer` are missing even though the change-review capability requires them, and the draft requirement still says reviewer-subagent actions are withheld "until the independent reviewer is added" although the reviewer exists.

## What Changes

- Enumerate all thirteen actions in the draft requirement, in the parameter's own order.
- Remove the stale sentence about withholding reviewer-subagent actions.
- Keep the apply requirement's text as written and add its four missing actions as an ADDED requirement, so neither requirement description outgrows the archive length limit.
- List the same thirteen actions in the `action` description.
- Add a test asserting the description names every value the parameter accepts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the draft requirement is corrected to the thirteen accepted actions, and a new requirement names the four reviewer actions the apply requirement does not carry.

## Impact

- `openspec/specs/tool-surface/spec.md`: through the delta.
- `lib/tools/review.js`: one description string; `test/descriptions.test.mjs`: one test comparing the description with the rendered enum; `test/review-reviewer.test.mjs`: one test driving `retry`, `replace` and `waive-reviewer` on an apply record.
- No behavior, schema, dependency, workflow, hook, coverage-baseline or `dist/` change.
