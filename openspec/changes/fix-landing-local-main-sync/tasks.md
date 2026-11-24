# Tasks

## 1. Record the post-merge sync failure

- [x] 1.1 Add the `main-sync-failed` phase, keep it open and out of the abandonable phases, and reject `prepare` on it.
- [x] 1.2 Write the phase after the merge instead of `archive-pending`, with the recovery in the error: align local main with `origin/main` and re-run `merge`, do not review again.

## 2. Guard the phase

- [x] 2.1 Rework the diverged-main case to expect `main-sync-failed`, the recovery text and no second merge.
- [x] 2.2 Add a case for an unpushed local main commit: phase, error, archive refusal, abandon refusal, `candidates` refusal, and the retry after aligning main.
- [x] 2.3 Confirm both cases fail against the previous implementation.

## 3. Document

- [x] 3.1 Describe the phase, its recovery and the session step in `docs/pr-review.md`, and guard the phase name in the documentation test.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs` (28 tests, 28 pass); with `scripts/pr-review-land.mjs` stashed, the two new cases fail.
- [x] 4.2 Run `/tmp/b3/gates.sh fix-landing-local-main-sync` (strict validation, `openspec:check` 116 passed, requirement length, generated skills, `check:pr`, `npm run verify` 1333 passed with line 98.63%, branch 93.61%, function 99.21% and no violation).
