# Tasks

## 1. Guard the prepare gates

- [x] 1.1 Let `prJson()` take arbitrary overrides instead of a fixed shape.
- [x] 1.2 Add a prepare-refusal test for a closed PR, asserting the error text and that no worktree is created.
- [x] 1.3 Add the same test for a draft PR.
- [x] 1.4 Add the same test for a failing rollup and for a pending rollup.
- [x] 1.5 Add the same test for zero active changes and for two active changes.
- [x] 1.6 Confirm each new test fails when its guard is skipped.

## 2. Cover the mixed poll list

- [x] 2.1 Add a failed-check and a pending-check PR to the mixed filter test and name it after the spec scenario.
- [x] 2.2 Assert the whole eligible candidate, including `baseRefOid`, `baseRefName`, `worktree`, `status` and `resume`.
- [x] 2.3 Confirm the test fails when the poll's CI filter is skipped.

## 3. Verify

- [x] 3.1 Run `node --test test/pr-review-watch.test.mjs`.
- [ ] 3.2 Run `npm run verify` on Node 24 and record the test summary and the coverage verdict.
- [ ] 3.3 Run `openspec validate test-watch-prepare-gates --strict` and `npm run check:pr`.
