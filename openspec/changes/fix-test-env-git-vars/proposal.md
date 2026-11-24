# Proposal

## Why

Git exports `GIT_DIR=<host>/.git/worktrees/<name>` to a `pre-push` hook that runs in a linked worktree. The hook runs `npm run verify`, `testEnvFor` hands the variable to the test process, and every fixture's `git init`, `commit` and `branch` then lands in the hosting repository: it gains fixture branches such as `refs/heads/origin/main`, the pushed branch is rewritten to a fixture commit, and `.git/config` takes the fixture identity. The main worktree gets no such variable, so the damage only shows after a push from a worktree. `development-workflow` has no requirement about these variables.

## What Changes

- `testEnvFor` leaves out the seven variables git injects and passes the rest of the environment through.
- A fixture creates its repository through `initFixtureRepo` (`test/git-fixture.mjs`), which fails and names the fixture root when no repository was created there. This covers a direct `node --test` that bypasses the entrypoints.
- `CONTRIBUTING.md` states both rules beside the `TMPDIR` note.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: one added requirement with a hook scenario and a fixture-registration scenario.

## Impact

- `scripts/test-env.mjs`: the shared environment for `scripts/run-tests.mjs` and `scripts/affected-tests.mjs`.
- `test/git-fixture.mjs`, `test/git-fixture.test.mjs`, `test/test-env.test.mjs`.
- `test/review-fixtures.mjs` and the fixture helpers of 18 test files call `initFixtureRepo`.
- No change to `scripts/coverage.mjs`: it spawns `scripts/run-tests.mjs`, whose environment is cleaned by `testEnvFor`, and its own git calls run in the repository root, where the injected `GIT_DIR` is the right directory.
- `.githooks/pre-push` is a restricted path and stays unchanged; clearing the variables at the top of the hook needs a maintainer commit on `main`.
