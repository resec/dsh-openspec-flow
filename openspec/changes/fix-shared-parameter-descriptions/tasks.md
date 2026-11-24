# Tasks

## 1. Unify the shared descriptions

- [ ] 1.1 Describe `change` as `Change name.` on `openspec_inspect`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_review` and `openspec_apply_worktree`.
- [ ] 1.2 Remove the store usage sentence from the `openspec_inspect` and `openspec_store_list` descriptions, keeping `Registered store id.` on the parameter.

## 2. Guard the surface

- [ ] 2.1 Derive shared parameter names from tools that expose the same name in more than three tools and assert one identical description per name.
- [ ] 2.2 Assert no tool-level description repeats `Pass store` or `Use it before asking for a store id`.
- [ ] 2.3 Confirm the guard fails when one `change` description is reverted.

## 3. Verify

- [ ] 3.1 Run `node --test test/descriptions.test.mjs`.
- [ ] 3.2 Run `openspec validate fix-shared-parameter-descriptions --strict`, `npm run openspec:check` and `npm run verify`.
