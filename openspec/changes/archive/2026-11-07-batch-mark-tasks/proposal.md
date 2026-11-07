# Mark tasks in batches

## Why

`openspec_mark_task_done` marks exactly one task per call. Agents often finish several tasks, then mark them one after another, so every task costs a separate model round trip and a result that repeats `change`, `progress`, `state` and the next task. On the probe change with 39 tasks, the 39 mark results total 14,220 bytes; batching four tasks per call cuts that to 3,461 bytes and 10 turns, and the checkbox flip already runs without the OpenSpec CLI, so a batch adds no query work.

## What Changes

- **BREAKING** `openspec_mark_task_done` takes `taskIds`, a non-empty array of task ids, instead of `taskId`; a single task is a one-element array. The optional `sourcePath` and `line` hints stay and continue to locate one of the ids.
- A batch is atomic: the tool resolves every id against the cached apply state and its tracking file before writing; when any id is missing, the call fails, reports the missing ids, and changes no checkbox.
- The result becomes `{ change, results: [{ id, status }], state, progress, next? }`. `status` is `flipped` when the call changed the checkbox and `already-done` when it was already complete; entries keep input order, and duplicates are reported once.
- The shipped skills, the scoped flow policy, `AGENTS.md` and `README.md` teach agents to mark a finished batch in one call.
- `openspec_apply_next` keeps returning a single `next`; batching does not require a wider pending list.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: task marking accepts several ids with all-or-nothing writes and reports one status per task.

## Impact

- Affected files: `lib/state.js`, `lib/tools/apply.js`, `lib/tools/shared.js`, `skills/openspec-apply-change/SKILL.md`, `lib/policy.js`, `AGENTS.md`, `README.md`, `index.js`, and the mark tests under `test/`.
- No CLI behavior change and no new dependency; the bundled OpenSpec 1.16.0 stays the authority, and a batch still costs zero CLI spawns between `openspec_apply_next` calls.
- An agent that marks one task now passes a one-element `taskIds` array and reads `results` instead of `taskId` and `status`; no other step of the apply loop changes.
- The separate evaluation harness carries a local `openspec-apply-change` copy that shadows the provider skill; its wording must move to `taskIds`/`results` separately.
