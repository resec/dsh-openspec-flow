# Tasks

## 1. Shared transient-failure helper

- [x] 1.1 Add `scripts/gh-retry.mjs` exporting a classifier for transient gateway failures (HTTP 5xx, gateway timeout, reset connection) and a runner that retries the single call it is given once after an injectable delay, then rethrows; verify with `node --test test/gh-retry.test.mjs` covering a 502 that succeeds on the retry, a 504 that fails twice, a non-transient failure rethrown without a second attempt, and an injected `0` delay
- [x] 1.2 Document the retry boundary in `docs/pr-review.md` where the batch and poll failures are described: read requests are retried once, a write is never replayed; verify the prose matches the tested behavior

## 2. Batch scalar list and per-pull-request inspection

- [x] 2.1 Make `syncBatch` list `number,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,labels` and read each candidate's changed paths with one `gh pr view <n> --json files` request, keeping the 20-update limit and the documented result fields; verify with `node --test test/pr-review-land.test.mjs` covering that the list arguments carry neither `files` nor `mergeStateStatus`, that a row changing two active changes is left out of `eligible` without an update request, that a scalar list failing once with `HTTP 504` is retried and its rows evaluated (two list calls), that an inspection failure is reported as a refusal which does not stop the batch and does not reduce `remaining`, that a mixed case reaching the update limit with one inspection refusal leaves `remaining` counting eligible rows without a result, and that an update-branch `HTTP 502` produces one update call with no second one
- [x] 2.2 Update the `sync-batch` paragraph in `docs/pr-review.md` Landing to state the scalar list, the per-pull-request changed-path read and the inspection refusal, and verify the prose matches the tested behavior

## 3. Unavailable batch list

- [x] 3.1 After the retried list request still fails transiently, return `{ apply, unavailable: true, locked: false, changed: false, checked: 0, eligible: 0, updated: 0, results: [], remaining: 0, error }` from `syncBatch`, add `apply` to the locked outcome so all three outcomes carry it, and let the command exit successfully; verify with `node --test test/pr-review-land.test.mjs` that a handler failing twice shows the list called twice and records no `syncs` entry, creates no `landings.json`, updates no branch, keeps `apply` in the unavailable result, that the locked test asserts `apply` alongside `locked`, and that `main` returns exit status 0 with the JSON on `--apply`
- [x] 3.2 Document the unavailable outcome and that the run continues to the landing or review step in `docs/pr-review.md` (the `sync-batch` Landing paragraph and scheduled step 6), and verify the prose matches the tested routing

## 4. Poll retry and fallback

- [x] 4.1 Make `pollPullRequests` retry its full-detail list request once and, when it still fails, read `number,headRefOid,baseRefOid,baseRefName,isDraft,labels`, issue `gh pr view <n> --json files,statusCheckRollup` for each row whose recorded entry does not record the current head as `commented`, pass the merged rows to `filterCandidates`, set `fallback: true`, and fail rather than report a partial list when a scalar-list or detail request stays unavailable; verify with `node --test test/pr-review-watch.test.mjs` covering a retried success without the marker, a fallback reporting the same candidate numbers as the full-detail read, the marker, an unrecorded row receiving a detail request and a recorded `commented` row not receiving one, a detail request retried once, both failure cases, and a `gh pr comment` failing with 502 attempted exactly once with the failure recorded
- [x] 4.2 Update the poll description in `docs/pr-review.md` (Commands and Session flow step 3) to state the retry, the fallback read, the `fallback` marker and the no-partial-list failure, and verify the prose matches the tested behavior

## 5. Integration

- [ ] 5.1 Run `npm run test:affected -- scripts/pr-review-land.mjs scripts/pr-review-watch.mjs scripts/gh-retry.mjs` and then the full `npm run verify` on the primary Node 24; verify both report a pass and the coverage verdict is a pass
- [ ] 5.2 Run `node scripts/pr-review-land.mjs sync-batch` and `node scripts/pr-review-watch.mjs poll --json` from the main worktree as read-only checks; verify exit status 0, that the batch reports a `checked` count equal to the open list, and that the poll still reports its candidates
- [ ] 5.3 Run `npm run check:requirement-length` and the OpenSpec strict validation for the change; verify both report no finding

## Workflow follow-up

- Commit the implementation, then run the apply review on the committed tree.
- Archive the change after the project's review requirements are satisfied.
- The scheduled task runs these scripts from the checkout, so no bundle repack is required for this change.
