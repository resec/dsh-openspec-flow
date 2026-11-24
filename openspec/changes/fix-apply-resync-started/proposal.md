# Proposal

## Why

`openspec_apply_next` also resyncs an apply that already started, and a worktree apply moves the session into its worktree. A later session can sit in the main root again: the host restores the directory, the user opens a new session, or a conversation returns to the project root. The planning copy for that change is no longer in main, so the entry's unconditional `assertDraftReviewReady` call fails while it loads the change through `openspec status`:

`Change 'add-dark-mode' not found. No changes exist.`

The `tool-surface` requirement "Apply resync tolerates a missing main planning copy" already says a started apply SHALL NOT read the change directory and SHALL use the recorded apply base instead. The entry did not follow it.

## What Changes

- In `lib/tools/apply.js`, resolve the recorded apply state before the draft gate. A state with status `active` or `landing` whose worktree still exists means apply already started, so the call skips `assertDraftReviewReady` and reuses the recorded base commit.
- Every other case keeps the gate: a change that never started still reads its artifacts and is refused when the planning copy or the readiness check fails, and a state without a worktree still needs the change directory.
- Replace the existing resync test with one that truly moves the session back to the main root, and add tests for an unstarted change, a landing apply and a missing worktree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `tool-surface` already requires this behavior; only the implementation lagged, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/apply.js`: the `openspec_apply_next` entry and one state helper.
- `test/review-apply.test.mjs`: the resync scenario and three guard tests.
- No payload, schema, doc, dependency, hook, coverage-baseline or `dist/` change. A store-backed change resynced from the main root no longer re-acquires its store lock, because resolving the store root would read the change directory.
