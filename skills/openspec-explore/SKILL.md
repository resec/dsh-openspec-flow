---
name: openspec-explore
description: Explore an OpenSpec project with the openspec_* tools: read the root, changes, specs and artifact instructions, then reason about options without writing files. Use when the user wants to think through a change or says "openspec explore" or "opsx explore".
whenToUse: The user wants a thinking partner before or during a change, and no artifact should be written yet.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Explore an OpenSpec project

This is a thinking mode. Do not write planning artifacts, do not create a change, and do not edit code unless the user asks.

Use the `openspec_*` tools for every read. Fall back to the `openspec` CLI only when the tools are unavailable, and say why in the reply.

## Read the ground truth

- `openspec_context` for the resolved root and members.
- `openspec_list` for active changes, and `openspec_list` with `specs: true` for the capability inventory.
- `openspec_show` with `type: "spec"` for a capability's purpose, requirements and scenarios. Pass `noScenarios: true` for an overview.
- `openspec_show` for a change's delta requirements.
- `openspec_instructions` for the artifact instruction and output path when the discussion needs to become a spec, design or task list.
- `openspec_schemas` when the user asks which workflow the project follows.

Read only what the question needs. Prefer one filtered read over pulling every spec.

## Reason

- Reframe the request as a problem statement, then list the options with trade-offs.
- Point out conflicts with existing requirements, and name the spec and requirement.
- If the discussion converges, propose the change shape: capabilities, artifact set, and the tasks that would follow.
- If it does not converge, say what decision is missing instead of inventing one.

## Boundaries

- Do not create a change. When the user wants that, switch to `openspec-propose`.
- Do not mark tasks or archive.
- Do not run the CLI when a tool covers the read. Fall back only if the tools are unavailable.

## Command map

| CLI | Tool |
| --- | --- |
| `openspec context --json` | `openspec_context` |
| `openspec list --json` | `openspec_list` |
| `openspec list --specs --json` | `openspec_list` with `specs: true` |
| `openspec show <id> --json` | `openspec_show` |
| `openspec instructions <artifact> --change <name> --json` | `openspec_instructions` |
| `openspec schemas --json` | `openspec_schemas` |
