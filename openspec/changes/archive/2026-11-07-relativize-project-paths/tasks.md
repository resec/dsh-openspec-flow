# Tasks

## 1. Path projection helper

- [x] 1.1 Add a `projectPath(root, value)` helper in `lib/state.js` that returns `.` for the root, a POSIX path for a child of the root, and the unchanged value for an outside or non-absolute path; verify with unit tests for each case.
- [x] 1.2 Export the helper and use it in `projectApply` and `projectMark` for every `contextFiles` array and `next.sourcePath`; verify a cached entry with a 44-character root returns short paths.
- [x] 1.3 Add `root` to the apply projection, using the cached `projectRoot` and the payload's root source, and leave the mark projection without one so the per-task response stays small; verify both schemas accept the result.

## 2. Remaining projections

- [x] 2.1 Convert `changeRoot`, `planningHome` and `actionContext.allowedEditRoots` in `projectStatus`; verify a root path becomes `.` and a store-relative planning home stays absolute.
- [x] 2.2 Convert `resolvedOutputPath` and `existingOutputPaths` in `projectInstructions`; verify `outputPath` stays relative to the change directory.
- [x] 2.3 Convert `change.path` and `change.metadataPath` in `openspec_new_change`, and `path` in `openspec_archive`; add `root` to the archive projection.
- [x] 2.4 Leave `openspec_init.root`, `openspec_store_list` and `openspec_context.members` unchanged; verify their tests still assert absolute values.

## 3. Input and schema

- [x] 3.1 Resolve a relative `sourcePath` in `openspec_mark_task_done` against the cached project root before verification; verify a relative and an absolute hint both mark the same task.
- [x] 3.2 Update `NEXT_SCHEMA`, `CONTEXT_FILES_SCHEMA`, `ROOT_SCHEMA` and the apply, mark and archive parameter descriptions to state the relative-path base; verify no description names the CLI.

## 4. Skills and README

- [x] 4.1 State in `skills/openspec-apply-change/SKILL.md` and `skills/openspec-flow/SKILL.md` that `contextFiles` and `next.sourcePath` are relative to `root.path` and must be joined before reading.
- [x] 4.2 Replace the README projection bullet with the new path convention and its absolute-root and store exceptions; verify the text matches the projections.

## 5. Tests

- [x] 5.1 Add unit tests for `projectPath`, including a root that is a prefix of a sibling directory and a value using the wrong case; verify no false relative result.
- [x] 5.2 Update `test/state-projections.test.mjs` and `test/projections.test.mjs` for the new expectations; verify every changed field asserts its relative form.
- [x] 5.3 Update `test/integration.test.mjs` for `change.path`, apply context files and the archive path, and add a regression test that marks a task with the returned relative `sourcePath`; verify the test passes against the real bundled CLI.

## 6. Verification

- [x] 6.1 Run `openspec validate relativize-project-paths`, `npm test` and `npm run coverage:check` on Node 24; verify all pass.

## Workflow follow-up

- Archive this change only when the user explicitly asks.
- After archive, commit the archive, docs and merged specs together, then push to `origin/main`.
