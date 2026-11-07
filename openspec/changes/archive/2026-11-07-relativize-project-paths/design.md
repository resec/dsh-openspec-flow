# Design: relative project paths

## Context

The tools project CLI JSON into compact payloads. Today every projected path is passed through unchanged, so the absolute root prefix repeats in each response. `openspec_apply_next` is the worst case because it returns four artifact paths plus the next task path.

The baseline changes every path field. The projection functions are pure and are covered by unit tests, which makes the conversion testable without the CLI.

## Decision: base is the resolved root, kept absolute once

The base SHALL be the resolved OpenSpec root (`root.path`, the directory that contains `openspec/`). It SHALL stay absolute in every response that returns relative paths, because a relative path with no base is unusable and the model may have a working directory above or below the root.

`openspec_apply_next` and `openspec_archive` currently do not return `root`; they gain it. The other read and write tools already return `root.path` or `changeRoot`. `openspec_mark_task_done` stays without a root: it runs once per task, so a repeated absolute root would cost more than the shorter path saves. Its `next.sourcePath` is relative to the root returned by the preceding `openspec_apply_next`, and the apply skill states this.

Rationale for not relativizing `root.path` itself: a path relative to the root cannot describe the root, and relativizing it against the session cwd would mix two bases (the proposal asked for the project root).

## Decision: `.` denotes the root

`path.relative(root, root)` is an empty string, which is not a usable path. The projection returns `.` instead. Consumers that join paths handle `.` as a no-op (`join(root, '.')` is `root`).

## Decision: paths outside the root stay absolute

A registered store's `root` and `metadataPath`, and a `planningHome` outside the project, cannot be expressed under the project root without `..` segments. The projection returns them unchanged. `openspec_store_list` has no project root context at all, so its output stays absolute.

## Decision: conversion happens in projections, not in the cache

The apply cache keeps absolute `sourcePath` values, because `markDone` reads and writes the file directly. Only the model-facing projections convert paths. This keeps `loadApplyState`, `markDone` and the cache tests unchanged.

## Decision: `openspec_mark_task_done` resolves a relative source path

The tool verifies the caller's `sourcePath` against the cached absolute path. A relative input is resolved against `entry.projectRoot` before comparison. An absolute input keeps working, so a stale call from before the change is not rejected.

## Decision: POSIX separators

`path.relative` returns backslashes on Windows. The projection normalizes them to `/`, matching the CLI's own `toPosixPath` and keeping tool output stable across platforms. The project-internal check uses the platform separator logic of `path.relative`, so a Windows root is still recognized.

## Exceptions

- `openspec_init.root` stays absolute: it names the project being created, so there is no existing root to be relative to.
- `openspec_instructions.outputPath` stays relative to the change directory (`proposal.md`). It names the artifact file inside the change; `resolvedOutputPath` is the root-relative projection of the same file.
- `openspec_context.members` is opaque workspace data. It is passed through unchanged; the CLI, not this plugin, decides its shape.

## Risks

- An agent may pass a relative `sourcePath` to the built-in `read` tool while its working directory is not the project root. The apply skill states that `contextFiles` and `next.sourcePath` are relative to `root.path` and must be joined before reading. The absolute `root.path` is always in the response, so the join is possible.
- A caller that treats every returned path as absolute (for example a test helper that calls `join(result.change.path, '.openspec.yaml')`) must join against `root.path` first. The integration test is updated accordingly.
- Token savings are bounded by path count: every response still carries one absolute root.

## Testing strategy

- Unit tests for the conversion helper: root itself becomes `.`, a child becomes a POSIX relative path, an outside path stays absolute, and a non-absolute value is unchanged.
- Projection tests for apply, mark, status, instructions, new change and archive.
- Integration tests that read a relative `contextFiles` path, pass a relative `sourcePath` to mark, and confirm the archive path is relative.
- The existing suite is updated only where it asserted the old absolute form; behavior not related to paths is untouched.
