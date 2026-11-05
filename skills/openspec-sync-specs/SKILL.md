---
name: openspec-sync-specs
description: Sync an OpenSpec change's delta specs into the main specs with the openspec_* tools, without archiving the change. Use when the user wants main specs updated now, or says "openspec sync" or "opsx sync".
whenToUse: The user wants main specs updated from a change's delta specs but does not want to archive the change.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Sync delta specs into the main specs

This updates `openspec/specs/` and leaves the change in place. It does not archive, move, or delete anything under `openspec/changes/`.

## Read

1. Call `openspec_status` to confirm the change exists and see its artifacts.
2. Call `openspec_instructions` for `specs` to get the delta instruction and the delta paths.
3. For each capability, call `openspec_show` with `type: "spec"` to read the current main spec, including its requirements and scenarios.
4. Read each delta spec file under the change's `specs/` directory.

## Apply the deltas

Edit the main spec files under `openspec/specs/<capability>/spec.md`:

- `## ADDED Requirements`: insert the full requirement and its scenarios.
- `## MODIFIED Requirements`: replace the existing requirement block with the full updated content.
- `## REMOVED Requirements`: delete the requirement block.
- `## RENAMED Requirements`: rename the requirement header only.

Read the whole delta and the whole target requirement before editing. Never copy a partial `MODIFIED` block; that loses detail.

## Verify

- Call `openspec_validate` with `scope: "specs"` and report every finding.
- If a delta cannot be applied cleanly, stop and report the conflicting requirement instead of guessing.

## Boundaries

- Do not archive the change and do not move files.
- Do not edit the delta specs in this workflow; that is `openspec-update-change`.
- Fall back to the `openspec` CLI only when the tools are unavailable, and say why in the reply.
