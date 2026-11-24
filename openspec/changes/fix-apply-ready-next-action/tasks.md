# Tasks

## 1. Resolve the ready action per kind and mode

- [x] 1.1 Make the readiness default `openspec_apply_next` for a draft and `openspec_archive` for an apply.
- [x] 1.2 Add a resolver that names `openspec_apply_worktree action=land` for a plugin-created active or landing worktree and `openspec_archive` otherwise.
- [x] 1.3 Pass the resolved action from `status`, `self-report`, `dispose` and `wait`; keep the draft action unchanged.

## 2. Guard the behaviour

- [x] 2.1 Assert the kind-aware readiness default and the explicit override in `test/review-unit.test.mjs`.
- [x] 2.2 Assert `status`, `self-report`, `dispose` and `wait` return one action in the compatibility path and in a plugin-created worktree.
- [x] 2.3 Confirm the new assertions fail with the implementation reverted.

## 3. Verify

- [x] 3.1 Run `node --test test/review-unit.test.mjs test/review-apply.test.mjs test/review-wait.test.mjs` (196 passed).
- [x] 3.2 Run `openspec validate fix-apply-ready-next-action --strict`, `npm run openspec:check` and `npm run layout:check`.
- [x] 3.3 Run `/tmp/b3/gates.sh fix-apply-ready-next-action`.
