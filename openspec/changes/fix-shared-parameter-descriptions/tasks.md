# Tasks

## 1. Unify the shared descriptions

- [x] 1.1 Describe `change` as `Change name.` on `openspec_inspect`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_review` and `openspec_apply_worktree`.
- [x] 1.2 Remove the store usage sentence from the `openspec_inspect` and `openspec_store_list` descriptions, keeping `Registered store id.` on the parameter.

## 2. Guard the surface

- [x] 2.1 Derive shared parameter names from tools that expose the same name in more than three tools and assert one identical description per name.
- [x] 2.2 Assert no tool-level description repeats `Pass store` or `Use it before asking for a store id`.
- [x] 2.3 Confirm the guard fails when one `change` description is reverted: restoring `Change name; required for the change lock scope.` on `openspec_apply_worktree` failed `shared parameter descriptions are uniform` with `openspec_apply_worktree.parameters.change differs from openspec_inspect.parameters.change` (3 pass / 1 fail).

## 3. Verify

- [x] 3.1 Run `node --test test/descriptions.test.mjs`: 4 passed, 0 failed.
- [x] 3.2 Run `openspec validate fix-shared-parameter-descriptions --strict` (valid), `npm run openspec:check` (119 passed, 0 failed) and `npm run verify` (1432 passed, 0 failed; line 98.63%, branch 93.72%, function 99.21%; new code 100.00% line).
