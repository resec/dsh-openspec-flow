# Design: Same-run review landing

## Context

See proposal.md - Why. The scheduled session currently advances one landing phase per run: a review run publishes a pass and stops, the next run prepares, and the run after that merges and finishes. The landing scripts already accept one owner session and token across `plan`, `prepare`, `reviewed`, `merge`, `archive`, `push` and `finish`; `finish` releases the lock. The apply review record is stored per change under the git common directory, so a landing checkout at the same commit passes the record gate without a second review.

## Goals / Non-Goals

**Goals**

- A review pass on a candidate that is not behind `origin/main` continues into the landing sequence in the same run.
- The continuation reuses the existing landing commands and lock protocol; no script behavior changes.
- A candidate that is behind, or any refused landing gate, stops the run with the recorded phase as the recovery point.
- The schedule documentation, `AGENTS.md`, the spec delta and the scheduled-session prompt describe the same contract.

**Non-Goals**

- Merging sync and review into one run; a sync rewrites the head and still requires a fresh review.
- Changing which labels authorize landing, the review gates, or the archive commit contents.
- Adding retries for a just-published pass comment that a candidate listing does not yet see.

## Decisions

**Trigger from `candidates`, not from the review result.** After publishing the pass and running `owner-review <n> --apply`, the run re-runs `pr-review-land.mjs candidates`. It is read-only, refuses while a lock is held, and reports `behind` and `syncable` per candidate. The run continues only when that listing returns the reviewed pull request itself as a candidate with `behind === false`, no other landing is unfinished and the lock is free; a missing `mergeable` label, an unfinished landing or a held lock stops the run before the lock is acquired. The lock target is the reviewed pull request, not the first candidate in the list. `plan` then repeats the latest-main check, so a stale candidate list cannot bypass the gate. Alternative: call `plan` directly after the review, which would skip the candidate listing and lose the behind distinction.

**One lock from `plan` through `finish`.** The run acquires the lock after the candidate listing and passes the same session and token to every landing command. `finish` releases the lock; any stop before `finish` releases it explicitly. The sequence is `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push`, `finish`. Alternative: release after `prepare` and resume next run, which is today's behavior and leaves a window for another landing to move `main`.

**Behind candidates stop instead of syncing in place.** `sync` rewrites the head, so the pass just published would no longer match the head and `reviewed` would refuse it. The run stops before acquiring the lock; the next run syncs a same-repository branch, waits for the new head's CI and reviews it, while a behind fork is refused by the listing and reported to its author. Alternative: sync and review again in the same run, which would make the run unbounded and hide the CI wait.

**A passed record over the landing tree skips the resume.** The `reviewed` gate reads the change-level apply record and compares `state` and `treeSha`; a record already passed for the PR head matches the landing tree at the same commit, so the continuation does not call `openspec_review action=resume`. A record that is not passed, or whose tree differs, falls back to the resume path required by `Fixed-session reviewer reuse`.

**A just-published pass is read once.** If the candidate listing does not return the pull request, the run stops; the next run follows the existing flow. This avoids a retry loop whose bounds would be hidden from the schedule.

**Documentation stays the source of the prompt.** `docs/pr-review.md` stays canonical; the scheduled-session prompt mirrors it, and `AGENTS.md` carries the maintainer-facing summary. The `pr-review-pipeline` delta holds the contract; the test asserts the scheduled-run scenario names.

## Risks / Trade-offs

- A review run becomes longer than five minutes → the next delivery waits for the session; the schedule already serializes deliveries, so no overlap occurs.
- A landing started during the review window can move `main` → the candidate listing reports `behind`, or `plan`/`merge` refuses on `preMergeMain`; the run stops safely.
- A failure after `merge` (archive or push) leaves the recorded phase behind → the next run resumes from that phase, as today.
- The four text locations can drift → the spec scenario inventory test and the doc assertions constrain them.

## Migration Plan

Update `docs/pr-review.md`, `AGENTS.md`, the spec delta and the tests, then update the scheduled-session prompt with `schedule_edit`. Rollback restores the previous text and prompt; no landing state or data migration is involved.

## Open Questions

None.
