# Tasks

## 1. Track the review probe fixture

- [ ] 1.1 Copy the eight probe files into `test/fixtures/probe/openspec/` and verify `find test/fixtures/probe/openspec -type f | wc -l` prints `8` and every path is inside the repository.
- [ ] 1.2 Point `PROBE_ROOT` in `test/review-fixtures.mjs` at `fileURLToPath(new URL('./fixtures/probe/openspec', import.meta.url))`, import it from `./review-fixtures.mjs` in `test/inspect.test.mjs` and `test/integration.test.mjs`, remove their local constants, and remove the `fileURLToPath` import only from `test/integration.test.mjs`; verify `grep -n "PROBE_ROOT =\\|\\.probe" test/inspect.test.mjs test/integration.test.mjs test/review-*.test.mjs` returns no matches and `node --test test/inspect.test.mjs test/integration.test.mjs test/review-*.test.mjs` passes.
- [ ] 1.3 Extend `test/repo-layout.test.mjs` to import `PROBE_ROOT`, assert it starts with the repository root, scan every top-level `test/*.test.mjs` except `test/repo-layout.test.mjs` for a literal `.probe` path or a `const`/`let`/`var` `PROBE_ROOT` declaration (the shared import is allowed), assert every fixture file is tracked after normalizing both sides to repository-relative paths, and skip only when `git rev-parse --is-inside-work-tree` fails; stage the fixture with `git add test/fixtures/probe/openspec` and verify `node --test test/repo-layout.test.mjs` passes.

## 2. Check pnpm in the lab doctor

- [ ] 2.1 Export `PNPM_VERSION = '12.6.0'` from `scripts/lab/core/doctor.mjs`, add `checkPnpm(env)` using that constant in its correction message, include it in `runDoctor` after the runtime check, and accept a `pnpm` dependency override; verify `node -e "import('./scripts/lab/core/doctor.mjs').then((m) => m.checkPnpm())"` reports the local pnpm.
- [ ] 2.2 Extend `test/lab-doctor.test.mjs` with the pnpm dependency fixture, a missing-pnpm runDoctor case and a direct `checkPnpm` case whose PATH cannot resolve pnpm, and change the existing browser assertion to find the `browser-binary` check by name; verify `node --test test/lab-doctor.test.mjs` passes and the failure text contains `PNPM_VERSION` and the install command.

## 3. Provision pnpm in CI

- [ ] 3.1 Add `pnpm/action-setup@v4` with `version: 12.6.0` to the `lab` job after `actions/setup-node@v4` and before `npm ci`; verify `grep -n "pnpm/action-setup\\|version: 12.6.0\\|npm ci" .github/workflows/ci.yml` shows the action and pin before `npm ci` in the lab block.
- [ ] 3.2 Add pnpm and the `npm install --global pnpm@12.6.0` command to `docs/lab.md`, add pnpm to the enumerated doctor failures in `docs/lab.md`, add pnpm to the `CONTRIBUTING.md` requirements and lab prerequisites, and name pnpm in the README doctor summary; verify `grep -n "pnpm@12.6.0" docs/lab.md` and `grep -n "pnpm" CONTRIBUTING.md README.md` show the entries.
- [ ] 3.3 Extend `test/ci-workflow.test.mjs` to import `PNPM_VERSION` from `scripts/lab/core/doctor.mjs`, extract the `lab` job block, assert the pnpm action appears there before `npm ci` with `version: ${PNPM_VERSION}`, and assert `docs/lab.md` names `pnpm@${PNPM_VERSION}`; verify `node --test test/ci-workflow.test.mjs` passes.

## 4. Integration verification

- [ ] 4.1 Run `npm run openspec:check` and `npm test` on Node 24 before the implementation commit; both pass.
- [ ] 4.2 After the implementation commit, with a clean tree, run `npm run verify` on Node 24; it passes and records the coverage stamp for that commit.
- [ ] 4.3 Run `npm run test:lab -- --mock-only` with pnpm 12.6.0 on `PATH`; every mock scenario passes.
- [ ] 4.4 Run `openspec_inspect` with `action: "validate"` and `strict: true`; no findings.

## Workflow follow-up

- Seal the ready draft with a commit that stages only the change directory and, when the plugin wrote it, `openspec/.gitignore`.
- Commit the implementation, then run the coverage gate on the clean committed tree; do not run `npm run verify` before that commit.
- Run the apply review, archive the change and push the archive commit.
- Confirm the pushed commit's `verify` and `lab` jobs pass.
