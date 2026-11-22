# Proposal

## Why

Several specs and one tool description still name tools the plugin does not register: `openspec_status` and `openspec_validate` were replaced by `openspec_inspect` actions, and `tool-surface` forbids registering them. The `strict` parameter description also names the CLI command `openspec validate --strict`, which the projection rule forbids in a description.

## What Changes

- Replace `openspec_status` / `openspec_validate` in `schema-compatibility`, `development-workflow` and `flow-policy` with the `openspec_inspect` actions that perform them.
- Describe `strict` as `Treat warnings as failures.` without naming a command.
- Add a description test that fails when any tool description names an OpenSpec command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-compatibility`: the accepted-schema and validation-gate requirements name `openspec_inspect` actions instead of removed tools.
- `development-workflow`: the verification and archive requirements name the `validate` action instead of a removed tool.
- `flow-policy`: the stage-gate requirement names the `validate` action instead of a removed tool.

## Impact

- `openspec/specs/*` through the deltas above; `lib/tools/query.js` (one description); `test/descriptions.test.mjs` (one test).
- No behavior change, no dependency, workflow, hook, coverage-baseline or `dist/` change.
