# Tasks

## 1. Candidate discovery coverage

- [x] 1.1 Read up to the GitHub CLI 1000-row ceiling in `poll` and `candidates`, and verify with a handler that truncates at the requested limit: a labeled pull request beyond 50 entries is evaluated by `candidates`, the 1000th row is evaluated, and an eligible review candidate beyond the old 100-row page is reported by `poll`, while a regression to 50 or 100 fails (`node --test test/pr-review-watch.test.mjs test/pr-review-land.test.mjs`)
- [x] 1.2 Document the 1000-row read and that a pull request beyond the ceiling is not discovered in `docs/pr-review.md` (Commands and Landing), and verify the prose matches the tested bound

## 2. Mergeable-first review order

- [x] 2.1 Request `labels` in the poll and order `mergeable`-labeled candidates before others while preserving each group's order, and verify with cases for labeled-first, stable order and a labeled draft staying out (`node --test test/pr-review-watch.test.mjs`)
- [x] 2.2 Document mergeable-first review ordering in `docs/pr-review.md` Session flow and verify the prose matches the tested behavior

## 3. Batch same-repository branch sync

- [x] 3.1 Implement `sync-batch` with dry-run default and `--apply`, reporting number, previous and new head, and refusal reason; skipping forks, up-to-date and conflicting branches; continuing after a refusal; refusing while a lock is held; stopping the run only after a changed head; continuing to the landing or review step for an empty, all-refused or locked batch; processing at most 20 updates per run after evaluating every returned row and waiting at most 10 seconds per head; and creating no landing entry, comment or label and making no force-push or admin call. Verify with a fixture covering every outcome, including the previous/new head report, dry-run writing nothing, lock refusal, empty batch, all-refused batch, changed-head stop and the 20-entry remainder (`node --test test/pr-review-land.test.mjs`)
- [x] 3.2 Document `sync-batch` in `docs/pr-review.md` Commands and Landing, including the 20-pull-request bound, the 10-second head wait, the changed-head-only stop and that it consumes no landing phase, and verify the documented command runs as written against the fixture

## 4. Scheduled run and prompt

- [x] 4.1 Update the Schedule section in `docs/pr-review.md` to reconcile, cleanup, preflight, unfinished landing or candidate, batch sync, then mergeable-first review, document that an empty, refused or locked batch continues to the review step, and verify the prose matches the tasks above
- [x] 4.2 Rewrite the DSH scheduled task prompt to that order, including the executable `sync-batch --apply` step and the changed-head-only stop, while keeping the fixed session and five-minute interval, and verify by reading the task back and confirming the order, the executable form and the stop rule appear exactly once
- [x] 4.3 Update `AGENTS.md` (the one-PR-at-a-time sentence and the single-sync description) and the `docs/pr-review.md` Non-goals sentence so both admit `sync-batch`, and verify by reading both files

## 5. Verification

- [x] 5.1 Run `npm run verify` on Node 24, `npm run check:requirement-length` and `openspec_inspect action=validate strict=true`, and verify all pass without warnings
