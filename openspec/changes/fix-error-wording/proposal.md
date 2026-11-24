# Proposal

## Why

Two error messages point the model at a surface it cannot use. Archiving a change that lives in a plugin-created worktree names the repository's own `land-apply-worktree` change as where the land action comes from, and the schema rejections call the supported schema "the CLI's built-in" and tell the caller to create the change with the OpenSpec CLI. The flow policy forbids an agent from running that CLI, so the recovery action, as written, cannot be followed.

## What Changes

- Rewrite the archive refusal to name the user-facing recovery: land the worktree with `openspec_apply_worktree action=land`, or abandon it with `action=remove` and the user's approval. Drop the internal change name.
- Rewrite the four schema rejections to speak of the built-in `spec-driven` schema instead of the CLI's copy, and to name a tool action — `openspec_new_change` for a new change, `openspec_inspect action="status"` for the resolved root — instead of a command.
- Add one test that drives the archive refusal and both schema rejections, and asserts their messages contain no `CLI` token, no bare `openspec <command>`, and no change name this repository tracks in `openspec/changes/archive/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `tool-surface` spec already requires every exposed step to run through an `openspec_*` tool, a failure to name the action that resolves it, and agent-facing text to stay on the tool surface; `schema-compatibility` already requires a recovery action. Only the wording was wrong, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/write.js`: the archive refusal message.
- `lib/schema.js`: the unsupported, shadowed, new-change and created-change schema messages.
- `test/descriptions.test.mjs`: one error-text test with three trigger paths.
- No payload, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
