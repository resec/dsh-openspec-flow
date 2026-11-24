# Tasks

## 1. Refuse the key separator

- [x] 1.1 Make `assertSafeSegment` refuse `#` and control characters, with `#` refused because `reviewKey` and `applyStatePath` build the key from it.
- [x] 1.2 Keep `reviewRecordNameForKey` on the path-segment rule only, so an existing record name that carries `#` stays readable.

## 2. Verify the state owner

- [x] 2.1 Make `validateApplyState` take the requested change and reject a state whose `change` differs.
- [x] 2.2 Pass the requested change from `readApplyState` and `writeApplyState`.

## 3. Guard the rules

- [x] 3.1 Assert that a `#` in a change name or store id is refused and that `a#b` with `c` and `a` with `b#c` build different keys in `test/review-unit.test.mjs`.
- [x] 3.2 Assert that a state file whose `change` was edited is rejected in `test/worktree-state.test.mjs`.
- [x] 3.3 Confirm the new assertions fail against the previous implementation.

## 4. Verify

- [x] 4.1 Run `node --test test/review-unit.test.mjs test/worktree-state.test.mjs`.
- [x] 4.2 Run `/tmp/b3/gates.sh fix-state-key-uniqueness`.
