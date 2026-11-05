---
name: openspec-propose
description: Propose a new OpenSpec change with the openspec_* tools: create the change, read each artifact instruction, write proposal, specs, design and tasks, then validate. Use when the user wants to plan a change or says "openspec propose" or "opsx propose".
whenToUse: The user wants a new OpenSpec change created end to end and the planning artifacts ready for review.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Propose a change with the plugin tools

Use the `openspec_*` tools for every step. Fall back to the CLI only when the tools are missing.

## Before creating

- Confirm the request and its scope. If the requirements are ambiguous, ask instead of proposing.
- If the project is not set up (`openspec_list` returns `setup: false`), ask whether to set it up with `openspec_init`, target a store, or skip OpenSpec.
- State the kebab-case change name and the artifacts it will produce, then wait for the user's confirmation.

## Create

1. Call `openspec_new_change` with the confirmed name, and a description or goal when the user gave one.
2. Call `openspec_instructions` for `proposal`. Read the instruction and write `proposal.md` at the returned `outputPath`, following the template and the project's `openspec/config.yaml` rules.
3. Call `openspec_instructions` for `specs`. Write one delta spec per capability listed in the proposal, using `## Purpose` for a new capability and `## ADDED` / `## MODIFIED` / `## REMOVED` / `## RENAMED Requirements` for the deltas.
4. Call `openspec_instructions` for `design`. Write `design.md` only when the change crosses modules, adds a dependency, changes data, or needs a technical decision.
5. Call `openspec_instructions` for `tasks`. Write `tasks.md` with numbered checkbox tasks grouped by `## 1. ...` headings.
6. Call `openspec_validate` for the change. Fix findings and re-validate.

## Then stop

- Present the proposal, specs, design and tasks, and the validation result.
- Do not start implementation. Apply begins only when the user asks.

## Command map

| CLI | Tool |
| --- | --- |
| `openspec list --json` | `openspec_list` |
| `openspec list --specs --json` | `openspec_list` with `specs: true` |
| `openspec show <spec> --type spec --json` | `openspec_show` |
| `openspec new change <name> --json` | `openspec_new_change` |
| `openspec instructions <artifact> --change <name> --json` | `openspec_instructions` |
| `openspec validate <name> --json` | `openspec_validate` |
| `openspec schemas --json` | `openspec_schemas` |
| `openspec context --json` | `openspec_context` |
| `openspec store list --json` | `openspec_store_list` |
