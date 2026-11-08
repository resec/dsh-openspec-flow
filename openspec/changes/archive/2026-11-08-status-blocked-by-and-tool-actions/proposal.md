# Proposal: status blockedBy and tool actions

## Why

`openspec_status` currently passes the upstream `nextSteps` sentences through unchanged. All 30 status results in the workspace history contain a shell command such as `Run openspec instructions apply --change "<name>" --json`; `openspec_instructions` has no `apply` artifact, and the plugin's contract is that the agent never runs the OpenSpec command. The same result also reports `isPlanningComplete: false` without naming the artifact that keeps planning open, which caused one session to spend nine calls reading the bundled command's source before writing the missing design.

## What Changes

- Add `blockedBy` to `openspec_status`: artifact ids whose status is `ready`, in build order, present only while planning is incomplete.
- Replace `nextSteps` strings with executable tool actions: `{ tool, arguments }`, naming `openspec_instructions` or `openspec_apply_next` and carrying `change`, `artifact` and `store` when applicable.
- **BREAKING** `nextSteps` changes from an array of strings to an array of objects.
- Update the status output schema, tool description, README and tests; no command text remains in `nextSteps`.

## Capabilities

### Modified Capabilities

- `tool-surface`: the status projection gains `blockedBy` and changes `nextSteps` to tool actions.

## Impact

- `lib/state.js`: `projectStatus` computes both fields and accepts the resolved store id.
- `lib/tools/query.js`: status output schema, field descriptions and the `execute` call.
- `test/state-projections.test.mjs`, `test/integration.test.mjs`: new and updated assertions.
- `README.md`: status row.
- No dependency, package or skill changes. `nextSteps` has no consumer outside the plugin's tests and projections.
