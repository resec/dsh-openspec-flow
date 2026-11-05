---
name: openspec-flow
description: Apply an OpenSpec change with the openspec_* tools: one compact apply payload, then one tool call per completed task instead of re-running instructions apply. Use for OpenSpec apply or implement work, or when the user runs /openspec-flow.
---

# OpenSpec flow

Use these tools when an existing OpenSpec project needs a change implemented. They do not initialize a project.

## Start

1. Call `openspec_list`. If `setup` is false, stop and report that the current directory is not an OpenSpec project. Do not run `openspec init` unless the user asks.
2. Choose the change. If several exist and the user did not name one, ask.
3. Call `openspec_status` for the change. If `isPlanningComplete` is false or artifacts are missing, finish planning first with the project's OpenSpec propose/update workflow; do not start apply.
4. Call `openspec_apply_next` once. Read every file listed under `contextFiles` before editing. Treat `instruction` as the CLI's current guidance. If `state` is `blocked`, stop and report the instruction and `missingArtifacts`.
5. If `store` applies, pass it on every tool call.

## Apply loop

While the latest result has `next`:

- Work only on `next`. Keep the change scoped to that task.
- Mark it with `openspec_mark_task_done`, passing `next.id` and optionally `next.sourcePath` and `next.line`.
- Continue with the `next` returned by that call. Do not re-run `openspec_apply_next` between tasks.
- If `status` is `already-done`, continue with the returned `next`.
- If `state` is `all_done`, leave the loop.

Pause and ask when a task is unclear, the implementation reveals a design issue, or the work needs scope beyond the spec and tasks. Mark a task only when its specified behavior is fully implemented, not when it is partially done or deferred.

## Finish

- Call `openspec_validate` for the change. Report `valid` and every issue.
- Report the final completed count and remaining tasks from the last payload.
- Archiving belongs to the project's OpenSpec archive workflow. Use it only when the user asks.

## Guardrails

- Only the CLI's built-in `spec-driven` schema is supported. A custom schema, or a project or user schema that shadows `spec-driven`, is rejected; report the error instead of retrying with another schema.
- Never hand-edit the tracking file's checkboxes. `openspec_mark_task_done` is the only write path.
- If a tool reports a missing or stale task, call `openspec_apply_next` to resync instead of guessing a line.
- These tools read state and flip task checkboxes. They do not create changes, edit specs, or archive.
