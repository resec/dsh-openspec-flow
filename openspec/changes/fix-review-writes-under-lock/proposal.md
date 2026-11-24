# Proposal

## Why

The change-review spec requires every review mutation to hold the review-directory lock. `draftReviewEntry` resolved the intent, wrote `policy.json` on a first start, migrated a missing `reviewerModel` on a resume, and built the draft object before `withReviewLockAsync`; `submitSelfReport` computed the current object hash before `withReviewLock`. Two concurrent starts could therefore both write `policy.json` (and the legacy `.gitignore` line) while neither held the lock, and a resume or self-report could decide on a hash that no lock covered.

`ensurePolicy`, `ensureApplyPolicy` and `ensureReviewerModel` write the policy directly and take no lock themselves, so moving them inside the existing lock is enough to serialize them.

## What Changes

- `draftReviewEntry` now enters `withReviewLockAsync` before reading or writing the policy, before validating the intent on a resume, and before building the draft object. The order of the checks and every error message stay as before, so an uncontended call reports the same verdict.
- `submitSelfReport` now computes the current object hash (the draft intent object or the apply git tree) inside `withReviewLock`, before it re-reads the record and compares the hash.
- New `test/review-write-lock.test.mjs` pins the write ordering: with the lock already held by another writer, a start writes no `policy.json`, no `review.json` and no `.gitignore` line; a resume reports the holder instead of judging a changed intent; a self-report reports the holder instead of reading a missing intent. A gated reviewer activation holds the lock while a second start runs and check that it reports the holder and leaves one valid record.
- Name the ordering in the policy-locking section of `docs/review.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already states that every review mutation holds a review-directory lock and writes through a temporary file plus a rename; only the implementation skipped the lock, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: `draftReviewEntry` and `submitSelfReport` move their pre-lock work inside the lock.
- `test/review-write-lock.test.mjs`: new ordering and contention assertions.
- `docs/review.md`: one paragraph in the policy-locking section.
- No change to error messages, verdicts, record fields, apply-lock ordering, dependencies, workflows, hooks, `dist/` or the coverage baseline.
