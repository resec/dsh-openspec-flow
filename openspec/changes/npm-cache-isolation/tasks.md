# Tasks

## 1. Lab cache selector

- [ ] 1.1 Change `scripts/lab/core/paths.mjs` to read only `OPENSPEC_FLOW_NPM_CACHE`, fall back to `.cache/lab/cache/npm`, and ignore `npm_config_cache`; update `test/lab-paths.test.mjs` with the new precedence, the ignored ambient variable and the fallback; verify `node --test test/lab-paths.test.mjs`.
- [ ] 1.2 Update `test/lab-env.test.mjs` to use the renamed variable; verify `node --test test/lab-env.test.mjs`.

## 2. Bootstrap cache selector

- [ ] 2.1 Change `scripts/bootstrap.mjs` to resolve `OPENSPEC_FLOW_NPM_CACHE` with the `.cache/npm` fallback and to pass the result to npm children as both `OPENSPEC_FLOW_NPM_CACHE` and `npm_config_cache`; export the resolver and add its assertions to `test/bootstrap.test.mjs`; verify `node --test test/bootstrap.test.mjs`.

## 3. Worktree environment

- [ ] 3.1 Add the `OPENSPEC_FLOW_NPM_CACHE` export to `renderPrint` in `scripts/worktree-env.mjs` while keeping the existing `npm_config_cache` export, delete the unused `resolveNpmCache`, and update `test/worktree-env.test.mjs` to assert both exports and the removal; verify `node --test test/worktree-env.test.mjs`.

## 4. Documentation and CI

- [ ] 4.1 Update `docs/lab.md` and the bootstrap usage text to name `OPENSPEC_FLOW_NPM_CACHE` and the ignored ambient variable; verify both files name the variable and `node scripts/bootstrap.mjs --help` prints the new text.
- [ ] 4.2 Add a `$GITHUB_ENV` step that writes `OPENSPEC_FLOW_NPM_CACHE=$HOME/.npm` to the CI lab job before `npm run lab -- doctor`, and assert the value and its position in `test/ci-workflow.test.mjs`; verify `node --test test/ci-workflow.test.mjs`.

## 5. Integration gate

- [ ] 5.1 Run `npm run test:affected -- scripts/lab/core/paths.mjs scripts/bootstrap.mjs scripts/worktree-env.mjs test/lab-paths.test.mjs test/bootstrap.test.mjs test/worktree-env.test.mjs test/lab-env.test.mjs test/ci-workflow.test.mjs` and fix failures.
- [ ] 5.2 Run `npm run check:requirement-length`, `npm run openspec:check` and `npm run verify` on Node 24, and report the test summary and coverage verdict.

## Workflow follow-up

- Publish the pull request and land it after the apply review is ready, following the maintainer flow.
