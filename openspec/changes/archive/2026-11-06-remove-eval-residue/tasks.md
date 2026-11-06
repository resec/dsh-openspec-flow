# Tasks

## 1. Documentation and spec

- [x] 1.1 Rewrite the README verification and coverage sections so neither names `test:eval`, `test:all` nor an eval run; verify `grep -nE 'test:eval|test:all|插件与 eval' README.md` prints nothing
- [x] 1.2 Rewrite the delta spec so the Verification requirement names only `npm test` and `npm run coverage:check`; verify `grep -nE 'test:eval|test:all' openspec/changes/remove-eval-residue/specs/development-workflow/spec.md` prints nothing
- [x] 1.3 Write the coverage-gate delta that removes the separate plugin/eval scope requirement and adds the plugin-only scope requirement; verify `openspec validate remove-eval-residue --strict` passes
- [x] 1.4 Edit the Purpose line of `openspec/specs/coverage-gate/spec.md` so it names the plugin scope only; verify `grep -n '^Defines how' openspec/specs/coverage-gate/spec.md` prints a line without `eval`

## 2. Coverage-gate tests

- [x] 2.1 Replace the `eval` scope labels in the `newCodeViolations` assertions with `plugin`; verify `node --test test/coverage-gate.test.mjs` passes on Node 24
- [x] 2.2 Remove the eval entries from the `writeBaseline` fixture and arguments; verify `node --test test/coverage-gate.test.mjs` passes on Node 24
- [x] 2.3 Remove the `eval/` directory, `.coverage/eval.info` and eval baseline scope from the report-and-enforce test; verify `node --test test/coverage-gate.test.mjs` passes on Node 24
- [x] 2.4 Confirm no eval reference remains in the file; verify `grep -n 'eval' test/coverage-gate.test.mjs` prints nothing

## 3. Integration checks

- [x] 3.1 Run `npm test` on Node 24 and confirm every test passes
- [x] 3.2 Run `npm run coverage:check` on Node 24 and confirm the gate reports no violations
- [x] 3.3 Run `openspec validate remove-eval-residue --strict` and confirm it reports valid with no issues

## Workflow follow-up

- Archive the change only after the user asks; archiving merges both delta specs into `openspec/specs/development-workflow/spec.md` and `openspec/specs/coverage-gate/spec.md`.
- After archive, commit the archive, the README update and the merged specs in one commit and push to `origin/main`.
