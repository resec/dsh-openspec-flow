# Surface project guidance in tool results

## Why

Projects can put `context`, per-artifact `rules` and `operations.apply|archive.guidance` in `openspec/config.yaml`. The bundled CLI returns them in its instruction payloads, but the plugin's projections drop them:

- `projectInstructions` maps only artifact fields, so `context` and `rules` never reach the agent.
- `openspec_instructions` with `artifact: "archive"` returns an artifact-shaped object with empty fields; the archive payload's `context` and `operationGuidance` are discarded.
- `projectApply` maps the apply state but drops the apply payload's `context` and `operationGuidance`.

The shipped skills tell the agent to follow `openspec/config.yaml` rules, yet the tools provide no such data. The agent has to read the config file separately or silently misses project constraints.

## What Changes

- `openspec_instructions` artifact results gain optional `context` and `rules` fields from the project config.
- `openspec_instructions` with `artifact: "archive"` returns an operation-shaped result: `{ change, artifact: "archive", context?, guidance? }`, with no artifact fields.
- `openspec_apply_next` gains optional `context` and `guidance` fields from the apply payload.
- The propose, update, apply and archive skills consume the returned fields; the archive skill reads the archive inputs before calling `openspec_archive`.
- README documents the mapping; tests cover configured and unconfigured projects.

All fields are additive. The only shape change is `artifact: "archive"`, which has no consumers and currently returns empty artifact fields.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: tool results carry project `context`, per-artifact `rules` and operation `guidance`.
- `skill-adaptation`: shipped workflow skills consume those fields.

## Impact

- `lib/state.js`: `projectInstructions` and `projectApply` projections.
- `lib/tools/query.js` and `lib/tools/apply.js`: output schemas and descriptions.
- `skills/openspec-propose`, `openspec-update-change`, `openspec-apply-change`, `openspec-archive-change`: workflow text.
- `README.md`: tool table and configuration note.
- `scripts/cli-contract.json` and `test/cli-contract.test.mjs`: record the new read fields and the archive instruction command.
- `test/projections.test.mjs`, `test/state-projections.test.mjs`, `test/integration.test.mjs`: regression coverage.
- No CLI, dependency, configuration-format or store change.
