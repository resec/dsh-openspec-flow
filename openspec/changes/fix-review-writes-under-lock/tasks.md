# Tasks

## 1. Move the draft policy work under the lock

- [x] 1.1 Enter `withReviewLockAsync` in `draftReviewEntry` before `ensurePolicy`, the `reviewerModel` migration, the resume intent check and `draftObject`, keeping the check order and every error message.
- [x] 1.2 Recompute the `self-report` current hash (draft object or apply git tree) inside `withReviewLock`, before the record is re-read.

## 2. Pin the ordering

- [x] 2.1 Assert a start under a held lock writes no `policy.json`, no `review.json` and no `.gitignore` line, and succeeds once the lock is free.
- [x] 2.2 Assert a resume under a held lock reports the holder instead of judging a changed intent, and still reports the intent verdict once the lock is free.
- [x] 2.3 Assert a self-report under a held lock reports the holder instead of reading a missing intent, and still reports the missing intent once the lock is free.
- [x] 2.4 Assert a second start reports the holder while a gated reviewer activation holds the lock, and that the record's `policyHash` matches the policy left on disk.
- [x] 2.5 Confirm 2.1-2.3 fail against the previous implementation.

## 3. Document the ordering

- [x] 3.1 Name the lock ordering in the policy-locking section of `docs/review.md`.

## 4. Verify

- [x] 4.1 Run `node --test test/review-write-lock.test.mjs`, `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-unit.test.mjs`, `test/review-model.test.mjs` and `test/policy.test.mjs`.
- [x] 4.2 Run `npm run verify` on Node 24 and record the test summary and the coverage verdict.
- [x] 4.3 Run `openspec validate fix-review-writes-under-lock --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-generated-skills.mjs` and `node scripts/check-pr-change.mjs` through `/tmp/b3/gates.sh`.
