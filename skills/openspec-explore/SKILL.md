---
name: openspec-explore
description: Explore an OpenSpec project with the openspec_* tools, reading the root, changes, specs and artifact instructions, then reasoning about options without writing files. Use when the user wants to think through a change.
whenToUse: The user wants a thinking partner before or during a change, and no artifact should be written yet.
metadata:
  generatedBy: dsh-openspec-flow@0.2.1
  upstream: openspec@1.16.1
---

# Explore an OpenSpec project

This is a thinking mode. Do not write planning artifacts, do not create a change, and do not edit code unless the user asks.

Use the `openspec_*` tools for every read. If a tool is unavailable, report it and stop.

## Read the ground truth

- `openspec_context` for the resolved root and members.
- `openspec_list` for active changes, and `openspec_list` with `specs: true` for the capability inventory.
- `openspec_show` with `type: "spec"` and `noScenarios: true` for a filtered overview of a capability's purpose and requirement texts.
- `openspec_show` with `type: "spec"` for the full spec, including scenarios. A filtered read is only an overview: before saying what a capability already covers or what should change, read every relevant spec in full.
- `openspec_show` for a change's delta requirements.
- `openspec_instructions` for the artifact instruction and output path when the discussion needs to become a spec, design or task list.
- `openspec_schemas` when the user asks which workflow the project follows.

Read only what the question needs. Start with the filtered read, then read in full every spec the answer depends on; do not pull unrelated specs.

## Reason

- Reframe the request as a problem statement, then list the options with trade-offs.
- Point out conflicts with existing requirements, and name the spec and requirement.
- If the discussion converges, propose the change shape: capabilities, artifact set, and the tasks that would follow.
- If it does not converge, say what decision is missing instead of inventing one.

## Boundaries

- Do not create a change. When the user wants that, switch to `openspec-propose`.
- Do not mark tasks or archive.
- Do not run any external command when a tool covers the read; report a missing tool instead.
