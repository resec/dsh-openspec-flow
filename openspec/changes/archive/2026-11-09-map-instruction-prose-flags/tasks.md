# Tasks

## 1. Instruction mapping

- [x] 1.1 Add the four prose-flag rules to `INSTRUCTION_COMMAND_MAP` in `lib/state.js` and cover `--store "<id>"`, bare `--store`, `--specs` and the line-wrapped `--type spec` in `test/projections.test.mjs`; verify `node --test test/projections.test.mjs` passes on Node 24.
- [x] 1.2 Extend the real-CLI integration test to read `proposal`, `specs`, `design` and `tasks` and assert no `--store`, `--type` or `--specs` remains, and that `context`/`rules` are unchanged; verify `node --test test/integration.test.mjs` passes on Node 24.

## 2. Verification

- [x] 2.1 Run `openspec_validate map-instruction-prose-flags` and `npm test` on Node 24; verify both report no errors.
- [x] 2.2 Run `npm run coverage:check` on Node 24; verify no violations.

## Workflow follow-up

- Archive the change and commit the archive, tests and merged spec together after review.
- Push to `origin/main` after the user asks.
