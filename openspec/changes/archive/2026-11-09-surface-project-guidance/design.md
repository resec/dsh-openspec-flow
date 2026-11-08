# Design: surface project guidance

## Context

The bundled CLI already separates project configuration from artifact text. `openspec instructions <artifact> --json` returns `context` and `rules` beside `instruction`; `openspec instructions archive --json` returns only `context` and `operationGuidance`; `openspec instructions apply --json` spreads `context` and `operationGuidance` into the apply payload. The plugin currently maps only the artifact fields and the apply state.

See [proposal.md](proposal.md) for why this matters.

## Goals / Non-Goals

- Goal: every configured constraint reaches the agent through the existing tools, with no extra CLI call for artifact or apply.
- Goal: keep the archive artifact usable by giving it a result shape that matches its payload.
- Non-goal: parse or validate `openspec/config.yaml` in the plugin; the CLI remains the authority.
- Non-goal: add a tool, change the store handling, or rewrite project-authored text.

## Decisions

### One `openspec_instructions` tool with two result shapes

The tool keeps the `archive` enum value but returns an operation object for it. The artifact shape is used for `proposal`, `specs`, `design` and `tasks`; the archive shape is `{ change, artifact: "archive", context?, guidance?, root? }`.

The output schema uses `oneOf` with disjoint `artifact` values: the artifact branch requires `schema`, `outputPath`, `instruction`, `dependencies` and `unlocks`; the archive branch requires only `change` and `artifact`. This expresses the contract without adding a tool or a second parameter.

Alternative rejected: a separate `openspec_archive_instructions` tool. It would add a resident tool definition and another choice for one infrequent step.

Alternative rejected: a single object with every field optional. It would lose the distinction between an artifact result and an operation result, and would let a broken artifact projection pass validation.

### Field names follow the result, not the CLI key

Artifact results use `context` and `rules`, matching the config sections. Apply and archive results use `context` and `guidance`; the CLI's `operationGuidance` is renamed to `guidance` so both operation results share one name. The skill text stays short and the same field name appears in both operation tools.

### Empty configuration is omitted

`context`, `rules` and `guidance` are included only when the CLI reports a non-empty value. A project without configuration produces the same artifact and apply results as today, except for the archive shape. This avoids empty fields in every result and keeps the unconfigured path unchanged.

### Project text is returned verbatim

Command mapping applies only to the schema `instruction` text, which the plugin already rewrites. Project `context`, `rules` and `guidance` are user-authored; they are returned exactly as the CLI reports them. Rewriting them could change project-specific commands or examples.

### Archive guidance is consumed before archiving

`openspec_archive` cannot return the guidance early enough: the guidance is meant to shape the archive step, so it must be read before the archive call. The archive skill gains one precondition call:

1. `openspec_instructions` with `artifact: "archive"`.
2. Follow `context` and `guidance` when present; proceed when both are absent.
3. Then the existing list, status, validate and archive preconditions.

This costs one cheap call per archive. The tool returns only `change`, `artifact` and `root` when the project has no archive configuration.

Alternative rejected: put the fields into `openspec_archive`'s result. The guidance would arrive after the archive already happened.

### Apply configuration rides on the cached apply state

`loadApplyState` already keeps the full CLI payload, and `isStale` already fingerprints `openspec/config.yaml`. `projectApply` can read `payload.context` and `payload.operationGuidance` without a new CLI call or cache path. A config edit still refreshes the cached entry through the existing meta hashes.

## Risks / Trade-offs

- **Token growth**: a project can set a large `context` (the CLI allows up to 50 KB), which now appears in each artifact result and in the apply result. Mitigation: only configured projects pay it, and the value is returned once per call rather than injected into every message by the plugin. The README documents the trade-off.
- **`oneOf` registration**: the output schema is validated when the tool is registered. If the host rejects `oneOf`, registration fails loudly and the fallback is a single permissive object schema. The existing description test exercises registration before any tool call.
- **Archive result shape change**: `artifact: "archive"` previously returned empty artifact fields. It had no callers in the workspace history and no shipped skill uses it. The archive skill is updated in the same change.
- **Verbatim project text**: project rules may contain command fragments; they are not rewritten. This is intentional and differs from the schema instruction mapping.

## Migration Plan

Additive fields need no migration. On upgrade, agents see `context`, `rules` and `guidance` only when the project config sets them. The archive skill's new precondition applies to new sessions; the old archive path remains valid because `openspec_archive` still performs its own validation.

Rollback is a normal revert: the fields are ignored by clients that do not read them, and the archive result returns to the previous empty-artifact shape.

## Open Questions

None.
