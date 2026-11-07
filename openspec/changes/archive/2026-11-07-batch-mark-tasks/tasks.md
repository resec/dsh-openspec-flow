# Tasks

## 1. State layer

- [x] 1.1 Add `resolveMarks(entry, taskIds, hint)` to `lib/state.js`: locate every id in the cached tasks, read its tracking file, verify the task line, and return `{ plans, missing }` without writing; verify a unit test in `test/state.test.mjs` covers a pending id, an unknown id and a duplicated id.
- [x] 1.2 Add `commitMarks(entry, plans)`: call `markDone` once per plan with the resolved location, return `results` in plan order with each id's `flipped` or `already-done` status, and report `interrupted` when a planned line no longer resolves; verify unit tests cover flipped, already-done and interrupted plans.
- [x] 1.3 Change `projectMark(entry, result)` to return `{ change, results: [{ id, status }], state, progress, next? }`; verify `test/state-projections.test.mjs` asserts input order, omitted `next` at `all_done`, and no top-level `taskId` or `status`.

## 2. Tool surface

- [x] 2.1 Replace the `taskId` parameter with `taskIds` (array of strings) in `lib/tools/apply.js`, add `requireTaskIds(args)` in `lib/tools/shared.js`, and reject an empty array, a non-string entry or an empty entry before touching state; verify an integration test asserts each rejection leaves the tracking file unchanged.
- [x] 2.2 Resolve the whole batch, reload the apply state once when any id is missing, resolve again, and fail the call through `taskNotFound` with every missing id; verify an integration test with one unknown id and two valid ids leaves all checkboxes unchanged.
- [x] 2.3 Change the output schema to `results` with `status` `flipped` or `already-done` (one entry per distinct task, input order) and keep `state`, `progress` and `next`; verify an integration test asserts the exact order for a mixed batch.
- [x] 2.4 Rewrite the tool, `taskIds`, `sourcePath`, `line` and `NEXT_SCHEMA.id` descriptions for the batch form, and document the atomic failure; verify `test/descriptions.test.mjs` still finds no CLI token and the wording names no second parameter.

## 3. Tests and existing callers

- [x] 3.1 Update every `openspec_mark_task_done` call in `test/integration.test.mjs`, `test/e2e.test.mjs` and `test/state.test.mjs` to `taskIds` and the `results` assertions; verify `npm test` passes on Node 24.
- [x] 3.2 Change the 39-task loop test to mark four ids per call, assert the summed result bytes stay below the single-id baseline, and assert no CLI spawn between `openspec_apply_next` calls; verify the logged byte totals.
- [x] 3.3 Add regression tests for a duplicate id (flipped once, one result entry), a batch with an already-done id, a batch carrying `sourcePath`/`line`, and the interrupted commit path; verify each fails before the implementation and passes after.

## 4. Skills, policy and docs

- [x] 4.1 Update the apply-loop text in `skills/openspec-apply-change/SKILL.md` to mark a finished batch in one `openspec_mark_task_done` call and read `results`; verify `test/skill.test.mjs` and `test/skills.test.mjs` pass.
- [x] 4.2 Update item 4 of `POLICY_TEXT` in `lib/policy.js` to the batch form; verify `test/policy.test.mjs` passes and the text matches the shipped skills.
- [x] 4.3 Update `AGENTS.md` items that describe the per-task call so they name the batch form; verify the wording matches the skills.
- [x] 4.4 Update the README tool table, the apply design note, the verification figures and the `index.js` module comment; verify the documented figures match the 39-task test output.

## 5. Verification

- [x] 5.1 Run `openspec_validate batch-mark-tasks`, `npm test` and `npm run coverage:check` on Node 24; verify all three pass.

## Workflow follow-up

- Archive this change only when the user explicitly asks.
- After archive, commit the archive, documentation and merged specs together, then push to `origin/main`.
