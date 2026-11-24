# Tasks

## 1. Keep a pending removal tracked

- [x] 1.1 Skip a tracked pull request whose `ownerReview` head is still recorded in `cleanupClosedPullRequests`, so a failed removal stays visible to reconcile.

## 2. Guard the retry

- [x] 2.1 Add a test that fails the first remove-label on a closed pull request, runs cleanup, and asserts the next reconcile removes it exactly once.
- [x] 2.2 Confirm the test fails when the cleanup exemption is reverted.

## 3. Document and verify

- [x] 3.1 Note the kept entry in `docs/pr-review.md`.
- [x] 3.2 Run `node --test test/pr-review-owner-review.test.mjs test/pr-review-watch.test.mjs` (45 passed).
- [x] 3.3 Run `/tmp/b3/gates.sh fix-owner-review-retry`.
