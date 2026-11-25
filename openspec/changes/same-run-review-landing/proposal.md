# Change: Same-run review landing

## Why

A labeled same-repository pull request that is behind `main` needs four five-minute runs today: sync, review, prepare, then merge and archive. The sync rewrites the head, so the next run must review it; only after that can prepare and the final landing sequence start. When the review pass already targets a head that contains the latest `main`, the prepare step and the final sequence have no remaining gate between them, and separating them by a run adds about five minutes per pull request plus a window in which another landing can move `main` and invalidate the prepared state.

## What Changes

- After a review run publishes a pass, the same run SHALL re-list landing candidates and continue only when that listing returns the reviewed pull request as a candidate that is not behind `origin/main`, no other landing is unfinished, and the landing lock is free.
- The continued sequence SHALL target that reviewed pull request and run `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push` and `finish` under one acquired lock, with `finish` releasing it.
- A candidate that is still behind `origin/main` SHALL stop the run before the lock is acquired; the next run syncs a same-repository branch and the new head is reviewed again, while a behind fork is reported to its author.
- An unlisted pass, a missing `mergeable` label, another unfinished landing or a held lock SHALL stop the run before the lock is acquired and leave the next run to the existing flow.
- A refused gate at any point SHALL stop the run and release an unfinished lock; the recorded landing phase remains the recovery point.
- The delta SHALL keep the existing `Scheduled run sequencing` description and scenarios intact except for the stopping and polling scenarios, and add the same-run continuation as its own requirement.
- The scheduled-run documentation, `AGENTS.md` and the scheduled-session prompt SHALL describe the same-run continuation.

## Capabilities

### Modified Capabilities

- `pr-review-pipeline`: the scheduled-run sequencing, fixed-session reviewer reuse and pull-request review requirements change so that a review pass can continue into the landing sequence in the same run, a passed record over the landing tree skips the resume, and that record replaces the prepared-landing review.

## Impact

- Documentation: `docs/pr-review.md` (Landing step 5 resume-skip, Landing step 9, Schedule preamble, steps 7 and 8, closing rules and the closing summary paragraph), `AGENTS.md` (scheduled pull-request review loop).
- Tests: `test/local-pr-spec.test.mjs` (delta path, the `Scheduled run sequencing` scenario inventory, the added `Same-run review landing` requirement, and the modified `Fixed-session reviewer reuse` and `Apply review on the pull-request branch` requirements), `test/local-pr-doc.test.mjs` (Landing and Schedule wording assertions), `test/contributor-docs.test.mjs` (AGENTS.md wording assertions).
- Runtime prompt: the five-minute scheduled session prompt.
- Scripts: no change; the landing commands already accept the same owner session and token across the sequence, and `finish` releases the lock.
