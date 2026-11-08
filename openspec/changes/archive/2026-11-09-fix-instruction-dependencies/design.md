# Design: fix instruction dependency references

## Context

See `proposal.md` — Why. The CLI `instructions --json` payload returns dependencies as descriptors `{id, done, path, description}` and unlocks as strings. `projectInstructions` maps both with `String()`; the output schema and tool description already promise string arrays.

## Goals / Non-Goals

- Goal: `dependencies` and `unlocks` are artifact id strings.
- Goal: tolerate both descriptor and string shapes.
- Non-goal: returning dependency `done`, `path` or `description`; status and apply already carry completion.
- Non-goal: changing the CLI or other projections.

## Decisions

### Artifact ids, not descriptors

Returning ids matches the existing schema and the `unlocks` shape. Returning descriptors would require a schema change and add bytes for fields status already carries, so the id form is the smaller contract fix.

### Tolerant input mapping

`projectArtifactIds` keeps string entries, reads `id` (then `artifactId`, `name`) from objects, and drops entries with no id. This keeps the projection stable if the CLI returns a mixed array, and never renders a descriptor through `String()`.

### Scope to instructions

`projectInstructions` uses the helper for both fields; other projections are untouched.

## Risks / Trade-offs

- [A descriptor uses a different key] → The helper checks `id`, `artifactId` and `name`; an unknown shape is omitted instead of becoming `[object Object]`.
- [A dependency has `done: false` and the id alone hides that] → `openspec_status` and `openspec_apply_next` carry completion; the instruction field is a reference, not a progress report.

## Migration Plan

No migration. Revert the commit to restore the previous projection.

## Open Questions

None.
