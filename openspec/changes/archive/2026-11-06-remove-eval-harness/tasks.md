# Tasks

## 1. Remove the harness

- [x] 1.1 Delete `eval/` from the repository; verify `test ! -e eval` and `git ls-files eval` print nothing
- [x] 1.2 Remove `test:eval`, `test:all` and the `eval:*` scripts from `package.json`; verify `grep -nE '"eval:|"test:eval"|"test:all"' package.json` returns no matches

## 2. Narrow the gates

- [x] 2.1 Remove the eval scope from `scripts/run-tests.mjs`, update the scope list and `all` handling, and verify `npm test` passes on Node 24
- [x] 2.2 Remove the eval scope from `scripts/coverage-gate.mjs`; verify `npm run coverage:check` passes and `coverage.baseline.json` has no `eval` scope

## 3. Documentation and ignore rules

- [x] 3.1 Replace the README evaluation section with a pointer to `dsh-openspec-flow-eval`; verify `grep -n 'eval/README\|npm run eval:' README.md` returns nothing
- [x] 3.2 Replace the AGENTS evaluation section with a pointer and drop `test:eval`/`test:all` from the verification text; verify `grep -n 'test:eval\|test:all\|eval/run' AGENTS.md` returns nothing
- [x] 3.3 Remove eval entries from `.gitignore`; verify `grep -n 'eval' .gitignore` returns nothing

## 4. Integration checks

- [x] 4.1 Run `openspec validate remove-eval-harness --strict` and confirm it reports valid with no issues
- [x] 4.2 Run `npm test` and `npm run coverage:check` on Node 24 and confirm both pass with only the plugin scope

## Workflow follow-up

- Archive the change only after the user asks; the archive removes the 14 requirements from the main spec.
- After archive, commit the archive, documentation updates and merged specs in one commit and push to `origin/main`.
- The independent `dsh-openspec-flow-eval` repository still needs its GitHub remote created and pushed.
