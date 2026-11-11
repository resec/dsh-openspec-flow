---
name: openspec-update-change
description: Revise an OpenSpec change's planning artifacts with the openspec_* tools and keep proposal, specs, design and tasks coherent. Use when the user wants to update a change's plan.
whenToUse: The user wants an existing change's artifacts revised, not implemented, and not the refresh action that regenerates generated files.
metadata:
  generatedBy: dsh-openspec-flow@0.3.0
  upstream: openspec@1.16.1
---

# Update a change's planning artifacts

This edits planning documents only. It does not implement code and does not archive.

Use the `openspec_*` tools for every step. If a tool is unavailable, report it and stop.

## Read first

1. Call `openspec_inspect` with `action: "status"` to see which artifacts exist and what is missing.
2. Read the change's `proposal.md`, `specs/`, `design.md` and `tasks.md` before editing.
3. Call `openspec_inspect` with `action: "instructions"` for each artifact you will touch. The instruction names the output path and the dependencies; when the result carries `context` or `rules`, apply them to the revision.

## Revise

- Keep the artifacts coherent: a scope change in the proposal must reach the specs, the design and the tasks.
- Preserve existing requirement blocks unless the change is about that requirement. Use full `MODIFIED` blocks.
- When new tasks are needed, add them under the existing groups and keep the numbering stable.
- Do not mark tasks complete in this workflow; that belongs to apply.

## Verify

- Call `openspec_inspect` with `action: "validate"` for the change and report every finding.
- If the revision changes behavior that is already implemented, say so and ask whether to reopen apply.

## Boundaries

- Do not edit code.
- Do not archive.
- If the user means regenerating generated files, that is a different action and out of scope; this plugin serves its skills directly and regenerates nothing.
