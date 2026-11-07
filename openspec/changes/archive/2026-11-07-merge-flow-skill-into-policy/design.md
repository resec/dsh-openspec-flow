# Design: Remove the openspec-flow skill

## Context

The plugin ships seven packaged skills: six stage skills plus `openspec-flow`. It also registers `openspec-flow:policy`, a scoped system prompt section whose 1297-character text states the stage gates. An audit of the skill's 2353-character body found:

- Every gate in the skill's `## Gates` section already appears in the policy text.
- The built-in `spec-driven` restriction appears in six tool descriptions (`openspec_status`, `openspec_instructions`, `openspec_validate`, `openspec_schemas`, `openspec_apply_next`, `openspec_mark_task_done`) and is enforced by the schema guard.
- Store propagation appears in `openspec-apply-change` and in every `store` parameter description.
- The `contextFiles` and `sourcePath` base appears in `openspec-apply-change`.
- The tool table and skill list republish catalogs the model already receives every turn.

The user chose a pure removal: nothing moves into the policy.

## Goals / Non-Goals

**Goals**

- One provider surface with six skills.
- No loss of tool behavior, policy text, or stage-skill content.
- Tests and docs describe the six-skill provider.

**Non-Goals**

- Changing `POLICY_TEXT`, adding a routing line, or otherwise enlarging the always-loaded section.
- Renaming the plugin, the provider (`openspec-flow`), or the policy section name.
- Replacing the skill with a thinner one.

## Decisions

### Delete the skill rather than keep a router

The unique content is either duplicated by a cheaper always-visible source or already owned by a stage skill. A router would keep a document whose only job is to point at six other skills the catalog already lists.

### Keep the policy text unchanged

The two gates the skill states and the policy lacks — the `spec-driven` restriction and store propagation — are repeated in the tool descriptions and the apply skill, and the schema guard enforces the first at call time. Adding them to the always-loaded section buys no coverage and spends resident context.

### Collapse PACKAGED_SKILL_NAMES into SKILL_NAMES

`PACKAGED_SKILL_NAMES` existed only to append the provider name as a seventh document. With no entry skill, the provider iterates `SKILL_NAMES` and the alias has no meaning.

### Remove loadSkillDocument

It loaded the entry skill's document for tests only. With the document gone, the export would be dead.

### Keep the provider and plugin names

`PROVIDER_NAME = 'openspec-flow'` is the provider id used by logs, tests and the registry; deleting a skill does not rename it.

## Risks / Trade-offs

- Habitual `/openspec-flow` users: the command stops resolving. README and AGENTS.md move the apply entry to `openspec-apply-change`.
- Stage routing now relies on the skill catalog descriptions. If a real-model run shows the model failing to select a stage skill, a one-line routing addition to `POLICY_TEXT` is the follow-up, not a reason to keep the skill.
- Coverage: deleting a covered helper and its test changes the percentages; `npm run coverage:check` must still pass (baseline delta bound 1.0).

## Migration Plan

None. A plugin upgrade plus a session restart removes the skill from the catalog; no project files or stored state reference it.

## Open Questions

None.
