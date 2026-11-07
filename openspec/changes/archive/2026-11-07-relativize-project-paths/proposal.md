# Relativize project paths in tool output

## Why

Every read tool returns absolute paths under the resolved OpenSpec root. The root prefix is repeated for every artifact, and `openspec_apply_next` spends 351 of its 669 bytes on four such paths (52.5%) on the probe project. The resolved root is already returned once, so the repeated prefix costs tokens without adding information.

A second inconsistency makes the cost easier to fix: `openspec_validate` already returns issue paths relative to the project root, while every other projected path is absolute.

## What Changes

- Project-internal paths in every tool output become relative to the resolved OpenSpec root, with `.` denoting the root itself and POSIX separators.
- `root.path` stays absolute and is documented as the base for the relative paths. `openspec_apply_next` and `openspec_archive` gain a `root` field so the base travels with their relative paths; `openspec_mark_task_done` stays without a root and inherits the base from the preceding `openspec_apply_next` response.
- Paths outside the project root, such as a registered store's root and metadata path or a planning home outside the root, stay absolute.
- `openspec_mark_task_done` accepts the relative `sourcePath` returned by `openspec_apply_next` and resolves it against the cached project root before verifying the task.
- `openspec_init` keeps an absolute `root`: it is the anchor of the project being created, not a path relative to an existing root.
- The shipped skills state the path base so an agent reads or writes a returned path against `root.path`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: projections return project-internal paths relative to the resolved root and carry that absolute root as the base.

## Impact

- Affected files: `lib/state.js`, `lib/tools/shared.js`, `lib/tools/apply.js`, `lib/tools/write.js`, `lib/tools/query.js`, `lib/schema.js` where a base root is derived, the six workflow skills under `skills/`, `README.md`, and `test/state-projections.test.mjs`, `test/projections.test.mjs`, `test/integration.test.mjs`.
- No CLI behavior changes; the bundled `@fission-ai/openspec` 1.16.0 stays the authority and is only projected differently.
- An agent that copies a returned path into `read` or `edit` must join it with `root.path` when its working directory is not the project root. The apply skill states this.
- Registered store paths are unaffected.
