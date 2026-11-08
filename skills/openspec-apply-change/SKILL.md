---
name: openspec-apply-change
description: Implement tasks from an OpenSpec change with the openspec_* tools. Use when the user wants to start, continue, or finish implementation.
whenToUse: The user wants to implement, continue, or finish an OpenSpec change in a project that has the dsh-openspec-flow plugin.
metadata:
  generatedBy: dsh-openspec-flow@0.2.1
  upstream: openspec@1.16.1
---

# Apply a change with the plugin tools

Use the `openspec_*` tools for every step. If a tool is unavailable, report it and stop.

## Start

1. Call `openspec_list`. If `setup` is false, stop and report that the directory is not an OpenSpec project; do not run `openspec_init` unless the user asks.
2. If no change is named, infer it from context. If several exist, ask.
3. Call `openspec_status` for the change. If `isPlanningComplete` is false or artifacts are missing, finish planning first; do not start apply.
4. Call `openspec_apply_next` once. Every `contextFiles` path is relative to `root.path`; join them with that absolute root before reading. Read every listed file before editing. Treat `instruction` as the current guidance, and follow `context` and `guidance` when those fields are present. If `state` is `blocked`, stop and report the instruction and `missingArtifacts`.
5. When the change lives in a store, pass the same `store` on every call.

## Loop

- Work through the pending tasks in order; keep each change scoped to its task.
- Verify the checkbox at `next.sourcePath` and `next.line` still matches `next.description`; `sourcePath` is relative to `root.path`, so resolve it against that root first. If it moved, call `openspec_apply_next` once to resync.
- Mark finished tasks with `openspec_mark_task_done`, passing every id finished since the last call in `taskIds`; include `next.sourcePath` and `next.line` when the batch starts at `next`.
- Continue with the `next` returned by that call. Do not re-run `openspec_apply_next` between tasks.
- If a result entry is `already-done`, that task needed no change; continue with the returned `next`.
- If `state` is `all_done`, leave the loop.

Mark a task only when its specified behavior is fully implemented, not when it is partially done, deferred, or covered by a narrowed interpretation.

## Pause

Ask before continuing when a task is unclear, the implementation reveals a design issue, the work needs scope beyond the spec and tasks, or a check fails repeatedly.

## Finish

- Call `openspec_validate` for the change.
- Report the completed count, the remaining tasks, and every validation issue.
- Archiving belongs to `openspec-archive-change`; use it only when the user asks.
