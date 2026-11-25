# Spec Delta

## MODIFIED Requirements

### Requirement: Scheduled run sequencing

The session SHALL reconcile `owner-review` and clean up each run. It SHALL advance one landing phase: resume or prepare a landing, land a mergeable candidate including a same-repository sync, except a not-behind review pass continuing in the same run. When no phase advances or a local owner holds the lock, it MAY review one candidate. A ready final review SHALL merge, archive and push in the same locked run. A synced head stops the run. Local pull requests SHALL be reported, never landed.

#### Scenario: A run stops after one landing phase

- **WHEN** a run completes a sync, or a prepare outside the same-run review landing, or a landing gate refuses
- **THEN** it stops, and a later run resumes from the recorded landing phase, syncs a same-repository branch, or reviews the new head

#### Scenario: A polling run

- **WHEN** a run runs cleanup and reviews one candidate
- **THEN** it stops after the review, or continues into landing when the same-run review landing requirement applies
- **AND** the next run polls again after cleanup without resuming a landing

#### Scenario: A cleanup-only run

- **WHEN** no candidate and no unfinished landing exist
- **THEN** the run runs cleanup and stops

#### Scenario: Final review and merge in one run

- **WHEN** the final apply review becomes ready and the landing lock is free
- **THEN** the same run records `reviewed`, merges, archives and pushes while holding the lock

#### Scenario: Archive and push wait

- **WHEN** a run records `reviewed` and merges
- **THEN** archive and push wait for the merge and complete in the same locked run before the lock is released

#### Scenario: A synced head waits for CI

- **WHEN** a sync changes the head and the new head has pending checks
- **THEN** the run stops and the head is reviewed once its CI rollup is green

#### Scenario: Contributor landing precedes review

- **WHEN** a mergeable contributor landing and a contributor review candidate are both available
- **THEN** the session advances the landing and leaves the review to a later run

#### Scenario: Landing lock is held

- **WHEN** a local owner holds the landing lock
- **THEN** the run does not start or resume a contributor landing
- **AND** it may still review one contributor candidate

#### Scenario: A run acquires the lock before landing

- **WHEN** a run has a contributor landing phase to advance
- **THEN** it runs the read-only candidate listing before acquiring the landing lock
- **AND** it passes the recorded owner session to the landing command

#### Scenario: Local pull request needs recovery

- **WHEN** a local pull request is merged but not landed
- **THEN** the run reports it and does not retarget, land or merge it

### Requirement: Fixed-session reviewer reuse

Runs SHALL reuse one fixed session. The landing stage SHALL resume the apply review in the same DSH session that started it, so the reviewer subagent stays bound, except that a passed record matching the landing tree SHALL skip the resume and advance `reviewed`. The final review SHALL use `openspec_review action=resume`, not `start`. A failed resume SHALL record the `review-failed` landing phase and stop the run; the session SHALL NOT call `replace`, start another session, or continue to merge.

#### Scenario: Final review resumes the reviewer

- **WHEN** the landing stage starts the final review on the landing branch
- **THEN** it resumes the recorded apply review and wakes the reviewer subagent bound to the same session

#### Scenario: Resume fails

- **WHEN** the reviewer cannot be resumed
- **THEN** `state --fail <n> --error <text> --apply` records the `review-failed` phase with the error, the checkout is kept, and the run stops without replacing the reviewer, starting another session or merging

#### Scenario: Reviewer is not started twice

- **WHEN** the apply review record already exists for the change
- **THEN** the final review does not call `start`

#### Scenario: A passed record skips the resume

- **WHEN** the apply review record is passed and its `treeSha` equals the landing tree
- **THEN** `reviewed` advances without `openspec_review action=resume`; otherwise the run uses the resume path

## ADDED Requirements

### Requirement: Same-run review landing

After a review run publishes a pass, the session SHALL re-list landing candidates and SHALL continue in the same run only when that listing returns the reviewed pull request as a landing candidate that is not behind `origin/main`; it SHALL then acquire the lock for that pull request and run `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push` and `finish`, with `finish` releasing the lock.

#### Scenario: A review pass continues into landing

- **WHEN** the re-listing returns the reviewed pull request as a candidate with `behind: false`, no other landing is unfinished, and the landing lock is free
- **THEN** the same run acquires the lock for that pull request and runs `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push` and `finish`
- **AND** `finish` releases the lock

#### Scenario: A behind pass waits for sync

- **WHEN** the re-listing returns the reviewed pull request as a candidate behind `origin/main`
- **THEN** the run stops before acquiring the lock
- **AND** a later run syncs a same-repository branch and reviews the new head

#### Scenario: An unlisted pass stops

- **WHEN** the re-listing does not return the reviewed pull request as a candidate because it lacks `mergeable`, another landing is unfinished, the landing lock is held, or a behind fork is refused with an author-update reason
- **THEN** the run stops without acquiring the lock and the next run follows the existing flow
- **AND** a behind fork is reported to its author
