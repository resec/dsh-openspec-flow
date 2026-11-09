# Tasks

## 1. Gate command

- [x] 1.1 Add `"openspec:check": "openspec validate --all --strict && openspec validate --archived --strict"` to `package.json`; verify `npm run openspec:check` exits 0 on the current tree and prints both validation summaries
- [x] 1.2 Verify the command fails on a warning by running it in a temporary project that has one scenario without a THEN step; confirm it exits nonzero and names the finding

## 2. Hook wiring

- [x] 2.1 Change `.githooks/pre-push` so it runs `npm run openspec:check` before `npm run coverage:check` and keeps `COVERAGE_SKIP=1` skipping only coverage; verify `COVERAGE_SKIP=1 sh .githooks/pre-push` still runs the validation step
- [x] 2.2 Update `scripts/install-hooks.mjs` messages to name both gates; verify `node scripts/install-hooks.mjs` prints the two-gate description

## 3. Tests

- [x] 3.1 Add `test/hooks.test.mjs` asserting the hook runs `openspec:check` before `coverage:check`, that both strict commands are in the npm script, and that `COVERAGE_SKIP` still leaves validation in place; verify the new test fails when the hook order is swapped and passes on Node 24
- [x] 3.2 Run `npm test` on Node 24 and confirm the suite passes with the new test included

## 4. Documentation

- [x] 4.1 Update `AGENTS.md`: the finish step uses `openspec_validate` with `strict: true`, the Verification section requires strict validation, and a skill text that omits strict does not lower this repository's gate; verify by reading the two sections
- [x] 4.2 Update `README.md` hook and bootstrap sections, and add the post-upgrade `npm run openspec:check` step to `docs/upgrading-openspec-cli.md`; verify each command shown runs as written

## 5. Verification

- [x] 5.1 Run `npm run openspec:check`, `npm test`, and `npm run coverage:check` on Node 24; confirm all three pass and report their output
- [x] 5.2 Run `openspec_validate` for `strict-artifact-gate` with `strict: true`; confirm it reports valid with no findings

## Workflow follow-up

- Archive the change with `openspec_archive` after the user confirms.
- Commit the archive, documentation updates, and merged specs in one commit, then push.
