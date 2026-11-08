# Design: status blockedBy and tool actions

## Context

See `proposal.md` - Why. The bundled status payload already carries `artifacts` with `done`, `skipped`, `ready` and `blocked` statuses, plus `isPlanningComplete`. `projectStatus` copies `artifacts` and passes `nextSteps` through. The next step upstream is a human sentence built around a command; the plugin's surface needs an executable tool call.

## Goals / Non-Goals

Goals: name the artifacts that hold planning open; make the next step directly executable; keep the store id in that step.

Non-goals: parsing the upstream sentence; projecting the resolved store identity into `root`; trimming `actionContext`; merging other query tools.

## Decisions

### Derive from artifacts, not from the sentence

`blockedBy` is `artifacts.filter((artifact) => artifact.status === 'ready').map((artifact) => artifact.id)`, in the order the payload already sorts. A `ready` artifact is the only one whose missing content can be written now; `blocked` artifacts wait on their dependencies. When planning is incomplete the schema has at least one root, so `ready` is non-empty.

Alternatives: replace fragments in the upstream sentence (fragile, and `instructions apply` maps to no tool); drop `nextSteps` (loses the hand-off). Deriving from the status graph matches the upstream decision without teaching the plugin the sentence format.

### Structured actions

`nextSteps` becomes `{ tool, arguments }`. `tool` is `openspec_instructions` or `openspec_apply_next`; `arguments` carries `change`, `artifact` for instructions, and `store` when the status call supplied one. A structured object avoids quoting prose into a call. `blockedBy` lists all ready ids while `nextSteps` carries only the first, because the upstream projection also selects one; listing every parallel action would duplicate the artifact table.

### Optional fields

Both fields are omitted when they do not apply: `blockedBy` when planning is complete, `nextSteps` when no action exists. The status payload therefore keeps its current size for a complete change apart from the action object.

## Risks / Trade-offs

- **BREAKING** `nextSteps` type: only the plugin's projection and tests read it; no skill does. Tests and README move with the change.
- Multiple ready artifacts: `blockedBy` is complete, `nextSteps` names the first. A model that wants another ready artifact can read `artifacts`; no information is lost.
- A store resolved through a project pointer or global default is not visible in the status arguments, so the action omits it. Explicit `store` is propagated; closing the resolved-store gap is a separate change.
- Upstream statuses change: the derivation depends on the documented `ready`/`blocked` values; unit and integration tests pin them.

## Migration Plan

No data migration. Revert the commit if the output type must be restored; the change is confined to the projection, schema, tests and README.

## Open Questions

None.
