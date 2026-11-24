# Tasks

## 1. Test entrypoints

- [x] 1.1 Drop the git-injected variables in `testEnvFor` (`scripts/test-env.mjs`) for the plain and the coverage run.
- [x] 1.2 Extend `test/test-env.test.mjs`: every listed variable is absent, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` are passed through, and the base environment is not mutated.

## 2. Fixture registration

- [x] 2.1 Add `test/git-fixture.mjs` with `initFixtureRepo`, which runs `git init` in the fixture root and fails, naming the root, when no standalone repository was created there.
- [x] 2.2 Add `test/git-fixture.test.mjs` covering a plain repository, a bare repository, an inherited `GIT_DIR` and a failed `git init`.
- [x] 2.3 Route the fixture `git init` calls through `initFixtureRepo`: `test/review-fixtures.mjs` and the local helpers of 18 test files. The `git init --bare <path>` call in `test/push-landed.test.mjs` stays, because git honours the path argument there.

## 3. Documentation

- [x] 3.1 State both rules in `CONTRIBUTING.md` beside the `TMPDIR` note.

## 4. Verify

- [x] 4.1 Run `node --test test/git-fixture.test.mjs test/test-env.test.mjs` (9 passed).
- [x] 4.2 Run `/tmp/b3/gates.sh fix-test-env-git-vars`: strict validation, `openspec:check`, the requirement length gate, the generated-skills check, `check:pr` and `npm run verify` (1337 tests, coverage gate enforced).
