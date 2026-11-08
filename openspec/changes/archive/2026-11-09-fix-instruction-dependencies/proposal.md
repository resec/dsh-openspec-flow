# Fix instruction dependency references

## Why

`openspec_instructions` declares `dependencies` and `unlocks` as arrays of artifact ids, but the projection maps CLI dependency descriptors with `String()`. For `specs`, `design` and `tasks`, the CLI returns objects such as `{id: "proposal", done: true, path: "proposal.md"}`; the tool therefore returns `["[object Object]"]` instead of `["proposal"]`. The same shape appeared in 8 sampled historical results and in this change's own instruction calls, so an agent reading the field gets no usable reference.

## What Changes

- Add `projectArtifactIds(value)` in `lib/state.js`: keep string entries, reduce objects to their `id`, drop entries without an id.
- Use it for `dependencies` and `unlocks` in `projectInstructions` instead of `map(String)`.
- Add unit coverage for descriptors, strings and an id-less entry, plus real-CLI integration assertions for all four artifacts.
- Add a `tool-surface` requirement: instruction references are artifact ids, never serialized object text.

## Capabilities

### Modified Capabilities

- `tool-surface`: the instruction projection contract gains a requirement that `dependencies` and `unlocks` are artifact id strings.

## Impact

- `lib/state.js` (`projectInstructions`, new helper)
- `test/projections.test.mjs`, `test/integration.test.mjs`
- `openspec/changes/fix-instruction-dependencies/specs/tool-surface/spec.md`
- No tool name, parameter, dependency or configuration change.
