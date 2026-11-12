---
name: openspec-explore
description: Explore an OpenSpec project with the openspec_* tools, reading the root, changes, specs and artifact instructions, then reasoning about options without writing files. Use when the user wants to think through a change.
whenToUse: The user wants a thinking partner before or during a change, and no artifact should be written yet.
metadata:
  generatedBy: dsh-openspec-flow@0.3.1
  upstream: openspec@1.16.1
---

# Explore an OpenSpec project

This is a thinking mode. Do not write planning artifacts, do not create a change, and do not edit code unless the user asks.

Use the `openspec_*` tools for every read. If a core tool is unavailable, report it and stop. `openspec_schemas` is a management tool: when it is unavailable, ask the user to run `/opsx-admin` and continue after it appears.

## Read the ground truth

- `openspec_inspect` with `action: "context"` for the resolved root and members.
- `openspec_inspect` with `action: "list"` for active changes, and with `specs: true` for the capability inventory.
- `openspec_inspect` with `action: "show"`, `type: "spec"` and `noScenarios: true` for a filtered overview of a capability's purpose and requirement texts.
- `openspec_inspect` with `action: "show"` and `type: "spec"` for the full spec, including scenarios. A filtered read is only an overview: before saying what a capability already covers or what should change, read every relevant spec in full.
- `openspec_inspect` with `action: "show"` for a change's delta requirements.
- `openspec_inspect` with `action: "instructions"` for the artifact instruction and output path when the discussion needs to become a spec, design or task list.
- `openspec_schemas` when the user asks which workflow the project follows; it appears only after the user runs `/opsx-admin`.

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
