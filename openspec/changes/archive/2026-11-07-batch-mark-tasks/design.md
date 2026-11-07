# Design: batch task marking

## Context

See `proposal.md` for the motivation. The current write path is small: `openspec_mark_task_done` calls `ensureEntry` once, `markDone` flips one checkbox from the cached task list, and `projectMark` returns `{ change, taskId, status, state, progress, next? }`. `markDone` already reads the tracking file, locates the task by line, description or numeric id, writes only the flipped line, and updates the cached progress, state and file hash. A miss triggers one full `loadApplyState` refresh before the tool reports the id as unknown.

The apply cache is a derived view over `openspec instructions apply`; it is validated against file hashes, so a batch that resolves from the cache does not add a query. All of the work below happens inside one tool call, without a new CLI spawn.

## Goals / Non-Goals

Goals:

- One call marks every task finished since the last call, with one result and one model round trip.
- A batch either marks all of its tasks or none of them.
- A mixed batch reports which ids needed no change, in input order.

Non-goals:

- No change to `openspec_apply_next`; it still returns one `next` task.
- No per-id `sourcePath`/`line` objects; the existing shared hints stay.
- No new CLI query, cache format or dependency.

## Decisions

### Decision: `taskIds` replaces `taskId`

The tool takes one parameter, `taskIds`, a non-empty array of strings; a single task is a one-element array. The alternative was keeping `taskId` and adding `taskIds`, or letting `taskId` accept either a string or an array. The first leaves two ways to call the same tool and costs schema tokens in every session; the second relies on a union type that models and schema validators handle less reliably. The plugin ships its own skills and is the only surface that calls the tool, so a renamed, breaking parameter is cheaper than a compatibility alias.

`requireTaskIds` trims each entry, rejects an empty array and any non-string or empty entry, and collapses exact duplicates before any state is touched.

### Decision: resolve every id before writing

`resolveMarks(entry, taskIds, hint)` is read-only. For each id it finds the cached task, reads that tracking file, locates the task in the file, and records `{ taskId, sourcePath, line }`. It returns the plans and the ids that did not resolve. `commitMarks(entry, plans)` then calls `markDone` once per plan with the resolved location.

The obvious alternative, looping `markDone` directly and stopping at the first failure, would leave a partial write: the agent would have to infer which checkboxes were already flipped from the error text. Retrying a corrected batch is cheap and idempotent, so resolving first is the better trade. Rewriting the writer to flip a whole file in one pass was rejected because it would duplicate the line, hash and progress logic that `markDone` already owns and break CRLF handling in the same place.

### Decision: one refresh, then fail the whole call

On any unresolved id the tool reloads the apply state once, exactly as the single-task path does today, and resolves the whole batch again against the fresh entry. A remaining miss fails the call through `taskNotFound` with the missing ids. Nothing was written at that point, so the failure message adds that no task was marked and lists the pending ids.

### Decision: `results` keeps one entry per task

The result becomes `{ change, results: [{ id, status }], state, progress, next? }`, with `status` `flipped` or `already-done` and entries in input order. Two arrays (`flipped` and `alreadyDone`) would be slightly smaller, but they split one answer into two fields and lose the pairing with the caller's order; a per-id entry is the clearer contract for a mixed batch. A duplicate id resolves to the same task and is reported once.

### Decision: the hints keep their meaning

`sourcePath` and `line` stay optional. `findTask` uses them only when the task at that location matches the requested id; otherwise it falls back to line, numeric id or description. Passing the same hint for a batch therefore cannot move a different id, and `next` from `openspec_apply_next` still pins the first task of a batch precisely.

### Decision: concurrent edits stay outside the guarantee

`commitMarks` can still hit a miss if the file changes between resolution and commit. That is the only partial-write window; it stops the batch and reports the ids already flipped plus a resync instruction. Without a concurrent writer, the batch is atomic.

## Risks / Trade-offs

- [Breaking parameter] The shipped skills, policy, `AGENTS.md` and README move in the same change; the evaluation repository's local `openspec-apply-change` copy must be updated separately because it shadows the provider skill. Mitigation: the tool description states the new shape, and the error for a missing `taskIds` names it.
- [A bad id wastes a whole batch] The agent resends the corrected list; the error names every missing id and the pending tasks, so the correction is visible. Mitigation: retries are idempotent.
- [Concurrent external edit] The rare interrupted commit reports the flipped ids. Mitigation: resync through `openspec_apply_next`; no silent loss.
- [Single-task calls grow slightly] The array wrapper and the `results` entry cost a few bytes per call. Mitigation: the batch case dominates, and the result no longer repeats `taskId` at the top level.

## Migration Plan

No data migration. The parameter and result shapes change in one release of the plugin; the linked profile picks the change up after a restart. Rollback is a revert of the change's commit, which restores the single-id surface.

## Testing strategy

- Unit tests for `resolveMarks` (pending, missing, duplicate, hint), `commitMarks` (flipped, already-done, interrupted) and `projectMark` (order and optional `next`).
- Integration tests with the real bundled CLI: a three-task batch flips exactly those lines in one call, a batch with one unknown id leaves the file byte-identical, a mixed batch reports statuses in input order, and duplicate ids flip once.
- The 39-task loop test batches several ids per call and still asserts that no CLI spawn happens between `openspec_apply_next` calls.
- `npm run coverage:check` on Node 24 covers the new branches.
