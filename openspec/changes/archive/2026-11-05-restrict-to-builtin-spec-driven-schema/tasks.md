# Tasks

## 1. Schema gate

- [x] 1.1 Add `lib/schema.js` with the built-in schema name, project/user shadow detection, and an `assertBuiltinSchema` error path; verify with a unit test that covers built-in acceptance, custom-name rejection, project shadow, user shadow, and missing root.
- [x] 1.2 Wire the gate into `lib/state.js` `loadApplyState` before the cache write; verify an integration test for `openspec_apply_next` on a custom-schema change fails without caching.

## 2. Tool surfaces

- [x] 2.1 Wire the gate into `openspec_status` and `openspec_validate`; verify integration tests that both reject custom and shadowed schemas while accepting the built-in schema.
- [x] 2.2 Confirm `openspec_mark_task_done` cannot bypass the gate through a cached entry; verify the apply integration test still completes the normal spec-driven loop.

## 3. Documentation

- [x] 3.1 Document the built-in-only schema rule and the rejection behavior in `README.md`, `skills/openspec-flow/SKILL.md`, and the affected tool descriptions; verify the text names `spec-driven` and the two rejection causes.

## 4. Verification

- [x] 4.1 Run `node --test test/` and `openspec validate restrict-to-builtin-spec-driven-schema`; verify both pass and report the command output.
