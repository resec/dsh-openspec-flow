# Proposal

## Why

`tool-surface` required the tool to be absent whenever the draft review is disabled, but the same capability requires a standalone apply review (`baseline: "none"`) with the draft review disabled. The implementation already registers the tool while either review is enabled, so the contradictory requirement is replaced.

## What Changes

- Remove "Draft review tool is absent when disabled" and add "The review tool follows the enabled reviews": registered while draft or apply is enabled, absent only when both are disabled.
- Add scenarios for the draft-only, apply-only and both-disabled cases.
- Add a test for the registration condition.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the registration requirement is replaced, including its scenarios.

## Impact

- `openspec/specs/tool-surface/spec.md`: through the delta.
- `test/admin.test.mjs`: one test.
- `test/review-draft.test.mjs`: the absence test, narrowed to the both-disabled case.
- No code change: `index.js:34` already registers the tool for either review; no dependency, workflow, hook, coverage-baseline or `dist/` change.
