---
name: openspec-apply-change
description: Implement tasks from an OpenSpec change with the openspec_* tools. Use when the user wants to start, continue, or finish implementation.
whenToUse: The user wants to implement, continue, or finish an OpenSpec change in a project that has the dsh-openspec-flow plugin.
metadata:
  generatedBy: dsh-openspec-flow@0.1.0
  upstream: openspec@1.16.0
---

# Apply a change with the plugin tools

Use the `openspec_*` tools for every step. If a tool is unavailable, report it and stop.

## Start

1. Call `openspec_list`. If `setup` is false, stop and report that the directory is not an OpenSpec project; do not run `openspec_init` unless the user asks.
2. If no change is named, infer it from context. If several exist, ask.
3. Call `openspec_status` for the change. If `isPlanningComplete` is false or artifacts are missing, finish planning first; do not start apply.
4. Call `openspec_apply_next` once. Read every file under `contextFiles` before editing. Treat `instruction` as the current guidance. If `state` is `blocked`, stop and report the instruction and `missingArtifacts`.
5. When the change lives in a store, pass the same `store` on every call.

## Loop

- Work only on `next`. Keep the change scoped to that task.
- Verify the checkbox at `next.sourcePath` and `next.line` still matches `next.description`; if it moved, call `openspec_apply_next` once to resync.
- Mark it with `openspec_mark_task_done`, passing `next.id`, `sourcePath` and `line`.
- Continue with the `next` returned by that call. Do not re-run `openspec_apply_next` between tasks.
- If `status` is `already-done`, continue with the returned `next`.
- If `state` is `all_done`, leave the loop.

Mark a task only when its specified behavior is fully implemented, not when it is partially done, deferred, or covered by a narrowed interpretation.

## Pause

Ask before continuing when a task is unclear, the implementation reveals a design issue, the work needs scope beyond the spec and tasks, or a check fails repeatedly.

## Finish

- Call `openspec_validate` for the change.
- Report the completed count, the remaining tasks, and every validation issue.
- Archiving belongs to `openspec-archive-change`; use it only when the user asks.
