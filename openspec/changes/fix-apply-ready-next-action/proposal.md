# Proposal

## Why

`draftReadiness` defaults its ready next action to `openspec_apply_next`. `status`, `self-report` and `dispose` never pass `readyAction`, so a ready apply review points the agent at apply again, while `wait` special-cases apply and returns `openspec_archive`. The same fact yields opposite next steps, and in self mode the model is steered back into an apply that cannot proceed. The flow rule already says a plugin-created worktree apply finishes with `openspec_apply_worktree action=land`, while other ready apply reviews archive.

## What Changes

- Make the readiness default kind-aware: `openspec_apply_next` for a draft and `openspec_archive` for an apply.
- Resolve the ready action explicitly at each entry instead of relying on the default: a ready apply whose state is a plugin-created `active` or `landing` worktree under `.cache/openspec-flow/worktrees/` names `openspec_apply_worktree action=land`; any other ready apply names `openspec_archive`; a ready draft keeps `openspec_apply_next`.
- Use the resolved action from `status`, `self-report`, `dispose` and `wait`, so the four entries agree.
- Cover both modes with assertions and keep the existing draft and compatibility-mode assertions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `tool-surface` already requires review next actions to name the round entry, `flow-policy` already makes land the terminal step for a plugin-created worktree apply and keeps archive for other changes, and `apply-worktree` already refuses archive for a plugin-created state while keeping the PR state's archive path. Only the implementation missed that binding, so this change sets `skip_specs: true`.

## Impact

- `lib/review/readiness.js`: the kind-aware ready default.
- `lib/tools/review.js`: one ready-action resolver and its four call sites.
- `test/review-unit.test.mjs`, `test/review-apply.test.mjs`, `test/review-wait.test.mjs`: new assertions.
- No schema, record, policy, dependency, workflow, hook, coverage-baseline or `dist/` change.
