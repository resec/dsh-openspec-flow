---
name: openspec-archive-change
description: Archive a completed OpenSpec change with the openspec_* tools, merging its delta specs into the main specs. Use when the user asks to archive or finalize a change.
whenToUse: The user explicitly asks to archive a finished change.
metadata:
  generatedBy: dsh-openspec-flow@0.8.0
  upstream: openspec@2.0.0
---

# Archive a change with the plugin tools

Archive only on an explicit request. A finished apply is not the same as a request to archive.

Use the `openspec_*` tools for every step. If a tool is unavailable, report it and stop.

## Preconditions

1. Call `openspec_inspect` with `action: "list"` and find the change. If `completedTasks` is less than `totalTasks`, report the remaining count and stop; archive waits for a completed change.
2. Check the apply review with `openspec_review` (`action: "status"`, `review: "apply"`). When `available` is false, say the project has no git repository and continue. When `policy` is false, say no apply review policy is locked and continue. When `enabled` is false, say the review is disabled and continue. Only when `policy`, `enabled` and `available` are true and `ready` is false, report its blockers and stop.
3. Call `openspec_inspect` with `action: "status"` to confirm planning is complete.
4. Call `openspec_inspect` with `action: "validate"`. Report every finding and stop when `valid` is false.
5. If the change is doc-only or tooling-only and does not alter spec-level behavior, ask whether to archive with `skipSpecs: true`.

## Archive inputs

- Call `openspec_inspect` with `action: "instructions"` and `artifact: "archive"` before archiving.
- Follow the returned `context` and `guidance` when present; when both are absent, continue.

## Archive

- Call `openspec_archive` with the change name. It re-validates, refuses on findings or incomplete tasks, and only then moves the change.
- While another change holds an apply lock, archive is refused and names the holder; finish and archive that change first. A successful archive releases this change's locks. A paused change's lock is removed only by the user; ask them instead of deleting it.
- Report `archivedAs`, `path`, `specsUpdated`, and any `warnings`.
- When `specsUpdated` is false and `skipSpecs` was not set, say that no main spec changed.

## After

- The change is now under `openspec/changes/archive/`.
- Do not create a new change or edit the merged specs unless the user asks.
