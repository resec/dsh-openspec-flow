# Tasks

## 1. Assert the empty-project scenario

- [x] 1.1 Assert `openspec/changes/` and `openspec/changes/archive/` exist after the first `openspec_init` call.
- [x] 1.2 Assert no `AGENTS.md` is generated at the project root.

## 2. Assert the existing-config scenario

- [x] 2.1 Write a custom `openspec/config.yaml` before the second call and assert its bytes are unchanged afterwards.

## 3. Prove the assertions bite

- [x] 3.1 Confirm the `changes/archive` assertion fails when the directory is absent.
- [x] 3.2 Confirm the existing-config assertions fail when the config guard is removed.

## 4. Verify

- [x] 4.1 Run `node --test test/integration.test.mjs`.
- [x] 4.2 Run `npm run verify` on Node 24 after the implementation commit, and record the test summary and the coverage verdict.
- [x] 4.3 Run `openspec validate test-init-scenarios --strict` and `npm run openspec:check`.
