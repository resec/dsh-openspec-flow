# Proposal

## Why

`skill-adaptation` requires the shipped workflow skills to tell the agent to use the `context`, per-artifact `rules` and operation `guidance` that the tools return. `test/skills.test.mjs` guards none of those sentences, so deleting them leaves the suite green and the requirement can regress silently.

## What Changes

- Assert that the propose and update skills follow the `context` and `rules` carried by an `instructions` result.
- Assert that the apply skill follows the `context` and `guidance` of an `openspec_apply_next` result.
- Assert that the archive skill reads the archive `instructions` before `openspec_archive`, follows the returned `context` and `guidance`, and continues when both are absent.
- Keep the assertions on field names and a directive verb, so an equivalent rewrite passes while a deleted sentence fails.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `skill-adaptation` requirement and its scenarios already state this behavior; only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/skills.test.mjs`: three document-structure tests and two helpers.
- No skill text, tool, dependency, workflow, hook, `coverage.baseline.json` or `dist/` change.
