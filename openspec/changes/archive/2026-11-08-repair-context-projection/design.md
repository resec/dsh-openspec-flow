# Design: repair the context projection

## Context

See `proposal.md` - Why. `openspec context --json` returns `{ root, members, status }`. The root is built by `toRootOutput`, which keeps `store_id` when the CLI resolved a registered store. Members are the project's `references` declarations, assembled by `assembleWorkingSet`: an available member has `role`, `id`, an absolute `path` and a `fetch` recipe; an unavailable one has no `path`, no `fetch`, and a diagnostic list. Diagnostics are `makeStoreDiagnostic` objects with `severity`, `code`, `message`, `target` and an optional `fix`.

`projectContext` currently rebuilds the root from `path` and `source` only, maps top-level status entries to message strings, and passes members through unchanged. That means the store id and every `fix` are lost, while the member `fetch` string stays a shell command. Tests only cover empty members and string status.

## Goals / Non-Goals

Goals: keep `openspec_context`, preserve the resolved store identity, keep recovery text in diagnostics, and make a referenced store's fetch executable as a tool action.

Non-goals: merging `openspec_context` into another tool; adding `store_id` to the root of every other projection; exposing `--code-workspace` or `--force`; adding store setup/register tools; changing `setup` semantics.

## Decisions

### Optional `store_id` on the shared root

Add optional `store_id` to `ROOT_SCHEMA` and let only `projectContext` copy it from the CLI root. The context tool exists to describe the working set, so the root's store identity belongs in its result. Other projections keep their current root shape and can adopt the field later; doing it everywhere would widen the change into every read tool and their consumers.

Alternatives: a separate context-root schema (duplicates the path rules and the base for relative paths); omit the field (leaves the tool unable to say which store it resolved).

### Diagnostics as objects

Project top-level and member diagnostics through one function into `{ severity?, code?, message, fix? }`, omitting fields the CLI did not send. `message` stays required; strings and unknown values are wrapped as `{ message }` so tolerant projection does not regress. `target` is dropped because it names a schema location, not an action the agent can take.

Alternatives: keep `string[]` (the `fix` is the recovery action and would stay lost); append the fix to the message (mixes data with presentation and makes the fix unaddressable).

### Members, and fetch as a tool action

Return members as explicit objects: `role`, `id`, optional absolute `path`, optional `fetch`, and normalized `status`. A referenced store is outside the resolved root, so its path stays absolute under the existing relative-path rule.

For an available member, replace the `openspec show <spec-id> --type spec --store <id>` string with:

```
fetch: {
  tool: openspec_show,
  arguments: { type: spec, store: <member id> },
  note: Set name to a spec id from this store; openspec_list with specs: true and the same store lists them.
}
```

The member does not know any spec ids, so inventing a `name` placeholder would invite a literal `<spec-id>` call. The note names the missing argument and the discovery step. The shape matches the structured tool actions already used by `openspec_status`. The action is derived from the member's `path` and `id`, not by parsing the upstream string, so a recipe wording change does not break the projection.

Alternatives: drop `fetch` (loses the upstream hint that the store can be read); keep the string (violates the no-command tool surface); include `name: "<spec-id>"` (ambiguous value).

### One diagnostic projector

Top-level and member diagnostics share the same projector. The status array and a member's status array carry the same `makeStoreDiagnostic` shape, and keeping one projector prevents the two from drifting in the fields they preserve.

## Risks / Trade-offs

- **BREAKING** `status` and `members[].fetch` shapes change. Mitigation: no consumer outside the plugin's tests and README reads them; both move with the change, and the delta spec records the new contract.
- `members` has no real-CLI test because a referenced store needs a registry fixture. Mitigation: projection tests cover available and unavailable members, including the fetch shape and the absence of command text; the integration test covers the empty-member path.
- `ROOT_SCHEMA` allows `store_id` while other tools do not emit it. Mitigation: the property is optional and documented as context output; propagating it to other tools is a separate change.
- Upstream diagnostic fields can change. Mitigation: the projector ignores unknown fields and tolerates missing ones, so a new field does not break the result.
- The fetch note repeats per available member. Mitigation: references are rare and only available members carry it.

## Migration Plan

No data migration. Revert the commit to restore the previous shapes; the change is confined to the projection, output schema, tests and README.

## Open Questions

None.
