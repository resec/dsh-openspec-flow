# Tasks

## 1. Canonical test temporary path

- [x] 1.1 Add `test/test-env.test.mjs` covering `testEnvFor` with a symlinked `TMPDIR`, an already canonical `TMPDIR`, an unresolvable `TMPDIR`, and the existing `NODE_COMPILE_CACHE` split; verify `npm test` fails before the implementation exists.
- [x] 1.2 Add `canonicalTempDir` to `scripts/test-env.mjs` and set `TMPDIR` in `testEnvFor` with a fallback to the inherited value; verify the new file passes and `npm test` is green on the baseline Node 24.

## 2. Bootstrap plan and options

- [x] 2.1 Add the entry-point guard, including the `process.argv[1]` check, to `scripts/bootstrap.mjs` so importing the module does not run bootstrap; verify `node -e "import('./scripts/bootstrap.mjs')"` returns without running `npm`, and `node scripts/bootstrap.mjs --help` still prints usage.
- [x] 2.2 Add failing cases to `test/bootstrap.test.mjs` for `parseBootstrapArgs` (`--skip-install`, `--playwright-host` with and without a value, `--reset-browsers`, the `--reset-browsers` with `--skip-playwright` conflict), `resolvePlan` in default, `--full`, `--skip-test`, `--skip-playwright` with a browser absent (expect no Chromium), `--skip-install` with and without dependencies, and `--reset-browsers` with a browser present (expect Chromium) and absent, plus `playwrightEnv`, `resetBrowsers` on a temporary directory, `dependenciesError` naming `npm ci` and `completionHint`; verify `node --test test/bootstrap.test.mjs` fails on the new cases and the test process spawns no `npm` or network command.
- [x] 2.3 Implement `resolvePlan(options, state)`, `playwrightEnv`, `resetBrowsers`, `dependenciesError`, `completionHint` and the expanded `parseBootstrapArgs` in `scripts/bootstrap.mjs`, wire them into `main`, and print the completion hint after the last successful step; verify `node --check scripts/bootstrap.mjs`, `node scripts/bootstrap.mjs --help` lists every new option, and the new bootstrap tests pass.
- [x] 2.4 Update the usage text in `scripts/bootstrap.sh`; verify `sh -n scripts/bootstrap.sh` and `scripts/bootstrap.sh --help` list every new option.

## 3. Contribution documentation

- [x] 3.1 Add `test/contributor-docs.test.mjs` that parses the `Absolute floor` and `New-code` table rows from `CONTRIBUTING.md`, compares each line, branch and function cell with `coverage.config.json`, checks the `1.00` point guard and the `npm run verify` and `npm run coverage -- --report-only` commands, and includes a negative case that relabels a row and expects a named failure; the same file asserts `AGENTS.md` scopes the push step to the maintainer and that the README publish order names the maintainer. Verify the test fails and names each missing item.
- [x] 3.2 Update the bootstrap steps in `CONTRIBUTING.md` so step 5 is the plain suite only in default mode and full mode runs verification instead, add `--skip-install`, `--playwright-host` and `--reset-browsers` to the options block, add the macOS notes for the mirror host and the resumable re-run, and make the verify instruction unconditional; verify the documented options match `parseBootstrapArgs` and the full-mode sentence matches `resolvePlan`.
- [x] 3.3 Add the coverage gate section to `CONTRIBUTING.md` with the `Absolute floor` and `New-code` table rows, the `1.00` point guard, `npm run verify` and `npm run coverage -- --report-only`; verify the documentation test's threshold assertions pass.
- [x] 3.4 Add the maintainer-only qualifier to `AGENTS.md` step 7 and to the README publish order, point external contributions at `CONTRIBUTING.md`, and update the README `--full` one-liner so it names verification instead of a second test pass; verify the documentation test's `AGENTS.md` assertions pass and the surrounding steps still read correctly.

## 4. Integration checks

- [x] 4.1 Run `npm test` on the baseline Node 24 and verify the full suite passes.
- [x] 4.2 Run `npm run openspec:check` and verify every active change, main spec and archived task check passes.
- [ ] 4.3 Run `npm run verify` and record the line, branch and function percentages plus the new-code result; verify zero violations.
- [ ] 4.4 Run `git diff --name-only` and `git status --porcelain`; verify only `scripts/test-env.mjs`, `scripts/bootstrap.mjs`, `scripts/bootstrap.sh`, `test/bootstrap.test.mjs`, `test/test-env.test.mjs`, `test/contributor-docs.test.mjs`, `CONTRIBUTING.md`, `AGENTS.md`, `README.md` and this change directory changed, and that `package.json` dependency fields, `coverage.baseline.json`, `dist/` and `openspec/changes/archive/` are untouched.

## Workflow follow-up

- Archive the change after the apply review is ready and the user requests it.
- The maintainer commits the archive and pushes `origin/main`; an external contribution stops at its pull request.
