# Proposal

## Why

Several specs and one tool description still name tools the plugin does not register: `openspec_status` and `openspec_validate` were replaced by `openspec_inspect` actions, and `tool-surface` forbids registering them. The per-action `strict` parameter description also named the CLI command `openspec validate --strict`. That text lived in the per-action definition, which the registered tool ignored: it carried a hand-written copy of the same parameter. The registered tool now reads the per-action description, so the projection rule covers the text that was actually wrong.

## What Changes

- Replace `openspec_status` / `openspec_validate` in `schema-compatibility`, `development-workflow` and `flow-policy` with the `openspec_inspect` actions that perform them.
- Describe `strict` as `validate: treat warnings as failures.` without naming a command, and have the registered tool read that per-action description instead of a second hand-written copy.
- Add a description test that fails when any tool description names an OpenSpec command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-compatibility`: the accepted-schema and validation-gate requirements name `openspec_inspect` actions instead of removed tools.
- `development-workflow`: the verification and archive requirements name the `validate` action instead of a removed tool.
- `flow-policy`: the stage-gate requirement names the `validate` action instead of a removed tool.

## Impact

- `openspec/specs/*` through the deltas above; `lib/tools/query.js` (one description); `test/cli-command.mjs` (the shared command list); `test/descriptions.test.mjs` (one test) and `test/review-doc.test.mjs` (imports the shared list).
- No behavior change, no dependency, workflow, hook, coverage-baseline or `dist/` change.
