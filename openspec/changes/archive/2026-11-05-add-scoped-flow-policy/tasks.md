# Tasks

## 1. Policy module

- [x] 1.1 Create `lib/policy.js` with `POLICY_TEXT`, `isOpenSpecProject`, `attachPolicy`, and `registerPolicy`; verify `node --check lib/policy.js` passes and the module imports without side effects.
- [x] 1.2 Wire the policy into `index.js`: add `agents` and `systemPrompt` to `inject`, call `registerPolicy(ctx)` from `apply`; verify importing `index.js` and applying it to the fake context registers no tools twice.

## 2. Tests

- [x] 2.1 Extend `test/fake-context.mjs` with `on`, `agents.list`, `systemPrompt.section`, `workingDirectory.get`, and an agent-scoped `ctx`; verify existing tests still pass.
- [x] 2.2 Add `test/policy.test.mjs` covering project detection, rule text for an OpenSpec project, empty text outside one, a working-directory switch, the load-time sweep, and idempotent attachment; verify `node --test test/` passes.

## 3. Documentation

- [x] 3.1 Update `README.md`, `AGENTS.md`, and `skills/openspec-flow/SKILL.md` to describe the scoped rule and its limits; verify the text matches the implemented behavior.

## 4. Verification

- [x] 4.1 Run `openspec validate add-scoped-flow-policy` and `node --test test/`; verify both pass and report the output.
