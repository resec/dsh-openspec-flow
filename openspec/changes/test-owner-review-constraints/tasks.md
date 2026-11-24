# Tasks

## 1. Guard the label writes

- [x] 1.1 Record every `pr edit` call and assert that an add and a remove write only `owner-review`.
- [x] 1.2 Assert that neither direction emits `--add-label mergeable` or `--remove-label mergeable`.

## 2. Guard the eligibility constraints

- [x] 2.1 Add a `mergeStateStatus: BLOCKED` rejection case with and without the advisory label.
- [x] 2.2 Add a pass comment on an older head and refuse it.
- [x] 2.3 Add a pass comment from another author and refuse it.

## 3. Guard the landing boundary

- [x] 3.1 Assert that `plan` refuses a pull request that carries `owner-review` but not `mergeable`.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-owner-review.test.mjs test/pr-review-land.test.mjs`.
- [x] 4.2 Re-run the new cases against each mutation: an extra `mergeable` write, the removed `BLOCKED` state, the replaced `trustedPass`, and the `owner-review` label accepted as landing authorization.
- [x] 4.3 Run `/tmp/b3/gates.sh test-owner-review-constraints` and record the test and coverage summary.
