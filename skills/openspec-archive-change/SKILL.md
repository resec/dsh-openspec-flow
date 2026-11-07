---
name: openspec-archive-change
description: Archive a completed OpenSpec change with the openspec_* tools, merging its delta specs into the main specs. Use when the user asks to archive or finalize a change.
whenToUse: The user explicitly asks to archive a finished change.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Archive a change with the plugin tools

Archive only on an explicit request. A finished apply is not the same as a request to archive.

Use the `openspec_*` tools for every step. If a tool is unavailable, report it and stop.

## Preconditions

1. Call `openspec_list` and find the change. If `completedTasks` is less than `totalTasks`, report the remaining count and stop; archive waits for a completed change.
2. Call `openspec_status` to confirm planning is complete.
3. Call `openspec_validate`. Report every finding and stop when `valid` is false.
4. If the change is doc-only or tooling-only and does not alter spec-level behavior, ask whether to archive with `skipSpecs: true`.

## Archive

- Call `openspec_archive` with the change name. It re-validates, refuses on findings or incomplete tasks, and only then moves the change.
- Report `archivedAs`, `path`, `specsUpdated`, and any `warnings`.
- When `specsUpdated` is false and `skipSpecs` was not set, say that no main spec changed.

## After

- The change is now under `openspec/changes/archive/`.
- Do not create a new change or edit the merged specs unless the user asks.
