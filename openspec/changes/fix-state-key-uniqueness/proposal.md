# Proposal

## Why

`reviewKey` joins `<store>#<change>`, and `applyStatePath` appends `.json` to that key, so `#` inside either half makes two different names build one key: `('a#b', 'c')` and `('a', 'b#c')` both become `a#b#c`. The review record, the apply state file, the change lock directory and the worktree directory all derive from that key, so the two names share one of each. `assertSafeSegment` refused `/`, `\` and NUL but not `#`.

A second collision comes from the filesystem: only the case of a name differs, the file names differ in bytes but not on a case-insensitive volume (APFS by default), and `readApplyState` returned the state of whichever change wrote first without looking at `state.change`. On such a volume `readApplyState('demo')` returned the state of `Demo`, and land or remove could act on another change's checkout.

## What Changes

- Refuse `#` and control characters in a `store` id or a change name, so one key names one pair.
- Check that a state file's `change` equals the requested change before the state is returned or written, so a shared file is reported instead of used.
- Add assertions for both rules: a `#` in a name is refused, `a#b` with `c` no longer shares a key with `a` with `b#c`, and a state whose `change` was edited is rejected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: `State names are safe path segments` now also refuses `#` and control characters, and a new requirement makes a state file's `change` part of what a reader verifies.

## Impact

- `lib/review/store.js`: `assertSafeSegment`, and the separator constant `reviewKey` and the new check share.
- `lib/worktree/state.js`: `validateApplyState` takes the requested change; `readApplyState` and `writeApplyState` pass it.
- Tests: `test/review-unit.test.mjs`, `test/worktree-state.test.mjs`.

Case-only collisions are not resolved here: the spec names no policy for them, refusing a name because another case variant exists needs a directory scan, and the state path format must not migrate. The identity check turns that collision from a silent wrong read into an error, and the residual is reported on the pull request.

Names that already carry `#` stay readable: `reviewRecordNameForKey` guards a key, which legitimately contains the separator, with the path-segment rule only. No path format, lock protocol, dependency, workflow, hook or `dist/` change.
