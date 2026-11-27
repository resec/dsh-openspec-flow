# Tasks

## 1. Guard the grouping key

- [x] 1.1 Assert that a failed check in one workflow and a newer success of the same name in another workflow are not green.
- [x] 1.2 Keep the same-workflow newer success as the green control.
- [x] 1.3 Assert that a status context and a same-named check run form two groups, with the failure on either side.

## 2. Guard the start time

- [x] 2.1 Assert that an entry with only `createdAt` still supersedes an older failure, and that the newest `createdAt` decides the group.
- [x] 2.2 Assert that an entry without `startedAt` or `createdAt`, an empty `createdAt` and a zero `startedAt` make the whole group require success.
- [x] 2.3 Assert that every entry sharing the latest start time must succeed.

## 3. Confirm the guard

- [x] 3.1 Run `node --test test/pr-review-watch.test.mjs` on the real implementation.
- [x] 3.2 Confirm the workflow cases fail when the grouping key drops `workflowName`.
- [x] 3.3 Confirm the superseded-failure cases fail when any failed entry fails the group.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-watch.test.mjs` and `node --test test/pr-review-land.test.mjs`.
- [x] 4.2 Run `npm run verify` on Node 24 and record the test summary and coverage verdict.
- [x] 4.3 Run `openspec validate test-checks-green-grouping --strict` and `npm run openspec:check`.
