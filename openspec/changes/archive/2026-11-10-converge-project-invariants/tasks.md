# Tasks

## 1. Remove the registry prototype

- [x] 1.1 Delete `openspec/invariants.json` and `test/invariants.test.mjs`, and verify `git status --short` no longer lists them and `npm test` still passes on Node 24.

## 2. Point documentation at the capability

- [x] 2.1 Replace the README invariant section with a pointer to the `project-invariants` requirements, and verify the README no longer mentions `openspec/invariants.json`.
- [x] 2.2 Point the AGENTS runtime and CLI bullets at `project-invariants`, and verify neither mentions `openspec/invariants.json`.

## 3. Verification

- [x] 3.1 Run `npm run openspec:check`, `npm test` and `npm run coverage:check` on Node 24 and record the exit codes; all three must pass before the change is complete.
