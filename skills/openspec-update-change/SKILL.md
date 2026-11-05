---
name: openspec-update-change
description: Revise an OpenSpec change's planning artifacts with the openspec_* tools and keep proposal, specs, design and tasks coherent. Use when the user wants to update a change's plan, or says "openspec update change" or "opsx update".
whenToUse: The user wants an existing change's artifacts revised, not implemented, and not the `openspec update` CLI command that refreshes generated files.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Update a change's planning artifacts

This edits planning documents only. It does not implement code and does not archive.

Use the `openspec_*` tools for every step. Fall back to the `openspec` CLI only when the tools are unavailable, and say why in the reply.

## Read first

1. Call `openspec_status` to see which artifacts exist and what is missing.
2. Read the change's `proposal.md`, `specs/`, `design.md` and `tasks.md` before editing.
3. Call `openspec_instructions` for each artifact you will touch. The instruction names the output path and the dependencies.

## Revise

- Keep the artifacts coherent: a scope change in the proposal must reach the specs, the design and the tasks.
- Preserve existing requirement blocks unless the change is about that requirement. Use full `MODIFIED` blocks.
- When new tasks are needed, add them under the existing groups and keep the numbering stable.
- Do not mark tasks complete in this workflow; that belongs to apply.

## Verify

- Call `openspec_validate` for the change and report every finding.
- If the revision changes behavior that is already implemented, say so and ask whether to reopen apply.

## Boundaries

- Do not edit code.
- Do not archive.
- If the user means the CLI's `openspec update`, which refreshes generated skills and commands, that is a different action; explain that this plugin installs its own skills through `openspec_init`.

## Command map

| CLI | Tool |
| --- | --- |
| `openspec status --change <name> --json` | `openspec_status` |
| `openspec list --json` | `openspec_list` |
| `openspec show <name> --json` | `openspec_show` |
| `openspec instructions <artifact> --change <name> --json` | `openspec_instructions` |
| `openspec validate <name> --json` | `openspec_validate` |
