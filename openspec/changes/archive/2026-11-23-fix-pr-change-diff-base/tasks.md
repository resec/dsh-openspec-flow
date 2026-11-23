# Tasks

## 1. Change check

- [x] 1.1 Add `--head <sha>` parsing with `HEAD` as the default, export `changedPaths(base, head, root)`, and compute the comparison with `git diff <base>...<head>`; verify `changedPaths('HEAD~1', 'HEAD', process.cwd())` returns the files of the last commit on the current tree.
- [x] 1.2 Read the base `package.json` through the tolerant helper and the head `package.json` through a helper that throws when the revision or file is unreadable, regardless of the base snapshot; verify the head helper throws for a revision without a `package.json`.
- [x] 1.3 Make a missing `--head` value a usage error and an unresolvable head a reported failure; verify the two exit codes through the tests added in task 2.4.

## 2. Tests

- [x] 2.1 Build a fixture repository with a recorded base, a pull-request branch whose active change has every task checked and a `package.json` identical at base and head, an advanced base that adds a restricted path, and a real merge commit of the two on `HEAD`; copy the script under the fixture's `scripts/` directory and assert the merge checkout fails without `--head` and passes with the pull-request head, and verify `node --test test/check-pr-change.test.mjs` passes.
- [x] 2.2 Assert that a head revision without `package.json` fails the step instead of skipping the dependency check; verify the assertion fails when the head read returns `undefined`.
- [x] 2.3 Keep the case where the pull request itself changes a restricted path failing with the path named; verify the assertion still fails when the restricted list is emptied.
- [x] 2.4 Spawn the script with a resolvable `--base HEAD` and `--head` as the last argument, then with `--base HEAD` and an unknown revision, and assert exit codes 2 and 1; verify both assertions fail when the corresponding branch returns 0.
- [x] 2.5 Extend `test/ci-workflow.test.mjs` to assert the CI step passes `--head` with the pull-request head expression and keeps the full-history checkout; verify the test fails when either is dropped.

## 3. CI and documentation

- [x] 3.1 Pass `--head "${{ github.event.pull_request.head.sha }}"` in the change-check CI step; verify the workflow parses as YAML and `npm run test:affected -- .github/workflows/ci.yml` passes.
- [x] 3.2 State in the `AGENTS.md` verification section that the change check compares the pull-request base with the pull-request head; verify the sentence names both revisions.

## 4. Verification

- [x] 4.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no error or warning.
- [x] 4.2 Run `npm run verify` on Node 24; verify the test summary passes and the coverage gate reports success.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
- Push the landed commits with `node scripts/push-landed.mjs --push`.
- Reopen the blocked pull requests and confirm strict validation and the length gate run.
