---
name: openspec-flow
description: Drive an OpenSpec project end to end with the openspec_* tools, covering init, propose, instructions, show, validate, apply, mark and archive. Use for any OpenSpec workflow, or when the user runs /openspec-flow.
---

# OpenSpec flow

The plugin exposes the whole agent-facing OpenSpec workflow. Use these tools instead of running `openspec` by hand; fall back to the CLI only when a tool is unavailable, and say why.

## Tools

| Group | Tools |
| --- | --- |
| Read | `openspec_list`, `openspec_status`, `openspec_show`, `openspec_context`, `openspec_schemas`, `openspec_store_list` |
| Plan | `openspec_instructions`, `openspec_validate` |
| Write | `openspec_new_change`, `openspec_archive`, `openspec_init` |
| Apply | `openspec_apply_next`, `openspec_mark_task_done` |

## Initialize or migrate

`openspec_init` creates `openspec/config.yaml` and `openspec/specs/` with `init --tools none`, so no official skill is generated. It then writes six plugin skills into `.dsh/skills/`:

- `openspec-explore`
- `openspec-propose`
- `openspec-apply-change`
- `openspec-archive-change`
- `openspec-sync-specs`
- `openspec-update-change`

An existing official skill is backed up to `.dsh/openspec-flow-backup/<timestamp>/` and replaced. A skill the plugin does not recognize is reported as a conflict and left alone unless the caller sets `force`. Re-run `openspec_init` after a plugin upgrade to refresh the skill text.

## Workflow skills

Pick the skill that matches the stage; each one names the tool for every step.

- Explore an idea: `openspec-explore`.
- Plan a change: `openspec-propose`.
- Implement it: `openspec-apply-change`.
- Revise its plan: `openspec-update-change`.
- Merge delta specs without archiving: `openspec-sync-specs`.
- Archive a finished change: `openspec-archive-change`.

## Gates

- Clarify scope before proposing.
- State the change name, artifacts and affected code, and wait for confirmation before creating the change.
- Do not edit implementation code until the user starts apply.
- Run `openspec_validate` and the project's tests before reporting completion.
- Archive only on an explicit request.
- Only the CLI's built-in `spec-driven` schema is supported; report a custom or shadowing schema instead of retrying.
- When a store is selected, pass the same `store` on every call.

## Apply loop

Call `openspec_apply_next` once. Read every `contextFiles` entry. Then work through `next`, marking each with `openspec_mark_task_done` and continuing with the returned `next`. Do not re-run `openspec_apply_next` between tasks; call it again only to start or resync.
