# Tasks

## 1. Plugin source module

- [x] 1.1 Add `eval/lib/plugin.mjs` with root resolution, package-name validation, provenance description and a base-commit check; add `eval/test/eval-plugin.test.mjs` covering the resolution precedence and an invalid root, and verify the file passes with `node --test eval/test/eval-plugin.test.mjs` on Node 24
- [x] 1.2 Add the clone helper to `eval/lib/plugin.mjs` with an injectable command runner, and cover success, checkout failure and an already-present clone in `eval/test/eval-plugin.test.mjs`; verify the same test file passes without network access

## 2. Path and configuration wiring

- [x] 2.1 Resolve the OpenSpec CLI lazily from the harness dependency tree in `eval/lib/paths.mjs`, remove the `REPO_ROOT` and `OPENSPEC_BIN` constants, and update `eval/lib/matrix.mjs`, `eval/lib/verify.mjs` and `eval/lib/profile.mjs` call sites; verify `npm run test:eval` passes for the affected tests
- [x] 2.2 Add `--plugin-root`, `--clone` and `--plugin-ref` to `eval/lib/config.mjs`, resolve `pluginRoot` through the precedence chain, and update `eval/test/eval-config.test.mjs`; verify the config tests pass under `npm run test:eval`
- [x] 2.3 Make `eval/lib/dsh-home.mjs` take the resolved plugin root instead of deriving it, pass it from `eval/lib/matrix.mjs`, and update `eval/test/eval-home.test.mjs` to assert the linked target; verify the home tests pass

## 3. Fixture and skill loading

- [x] 3.1 Use the resolved plugin root for `git archive`, load `installSkills` from that root with `createRequire`, and default the fixture node_modules source to the harness dependency root in `eval/lib/fixtures.mjs`; update `eval/test/eval-fixtures.test.mjs` and verify it passes with the real fixtures
- [x] 3.2 Pass `pluginRoot` through `eval/lib/matrix.mjs` to fixture preparation and home creation, record `plugin` provenance in each run record, and update `eval/test/eval-matrix.test.mjs`; verify the matrix tests pass

## 4. Entry point, sample data and documentation

- [x] 4.1 Print the resolved plugin root in the dry-run plan and run the clone fallback only on execute in `eval/run.mjs`; update `eval/test/eval-run.test.mjs` and verify the run tests pass
- [x] 4.2 Move the archived change used by the validation test into `eval/fixtures/verify-change/` and update `eval/test/eval-verify.test.mjs` to read it; verify the verify tests pass
- [x] 4.3 Document plugin root resolution, the clone fallback and provenance in `eval/README.md` and `AGENTS.md`; verify the documented `npm run eval:dry` output names the plugin root

## 5. Integration checks

- [x] 5.1 Run `npm run test:eval` on Node 24 and confirm every eval test passes without a provider call
- [x] 5.2 Run `npm run test:all` and `npm run coverage:check` on Node 24 and confirm both pass
- [x] 5.3 Run `npm run eval:dry` and confirm it names the plugin root and makes no network or model call

## Workflow follow-up

- Archive the change only after the user asks.
- After archiving, commit the archive, the merged spec and the implementation in one commit and push to `origin/main`.
