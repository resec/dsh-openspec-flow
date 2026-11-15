# Spec Delta

## REMOVED Requirements

### Requirement: The changer waits for the reviewer report

**Reason**: `wait` no longer polls the review record. It returns without polling from a read after the best-effort session write, and the submit and deadline wakeups replace the polling loop.
**Migration**: Call `openspec_review` with `action: "wait"`. A `waiting` result ends the turn; the reviewer submit or the deadline wakeup resumes the changer. A non-polling `wait` no longer observes a review record deleted during the call or a cancellation that arrives mid-wait. `OPENSPEC_FLOW_REVIEW_POLL_MS` is ignored and may be deleted from the environment.

## ADDED Requirements

### Requirement: The changer checks the reviewer report without polling

`openspec_review` with `action: "wait"` SHALL NOT poll. It SHALL return `ready` when the latest round has a report or the reviewer is waived, `overdue` at the deadline, and `waiting` otherwise; `waiting` SHALL set `waitState: "waiting"` and tell the changer to end its turn. The result SHALL come from a read after the best-effort session write, which SHALL re-read inside the lock and change only `changerSessionId`. The deadline SHALL remain `waitMinutes`.

#### Scenario: Reviewer already submitted

- **WHEN** the latest round has a report before `wait` is called
- **THEN** `wait` returns `ready` and the readiness calculation runs

#### Scenario: No report before the deadline

- **WHEN** the latest round has no report and the deadline has not passed
- **THEN** `wait` returns `waiting` and instructs the changer to end its turn

#### Scenario: Deadline has passed

- **WHEN** the wait deadline has passed and no report arrived
- **THEN** `wait` returns `overdue`

#### Scenario: Wait does not sleep on a poll interval

- **WHEN** `wait` is called for a pending reviewer
- **THEN** it returns from the post-write read without a poll loop

### Requirement: A reviewer submit wakes the changer

A successful `openspec_reviewer` submit SHALL wake the changer through `subagents.sendMessage` with `steer` delivery. Targets SHALL be the recorded changer session and the pending-deadline waiter, deduplicated. The message SHALL name the change, review kind, round, verdict, readiness and next action (which may be `openspec_apply_next`, `openspec_archive` or an `openspec_review` action). A failed wakeup SHALL NOT fail or roll back the submission; it SHALL be logged.

#### Scenario: A submit wakes the changer

- **WHEN** the reviewer submits a report and the changer is idle
- **THEN** a steer message is delivered to the changer session

#### Scenario: A lock-skipped wait write still receives the wakeup

- **WHEN** a wait's session write was skipped by lock contention and the reviewer submits
- **THEN** that waiter is among the wakeup targets

#### Scenario: The reviewer has no addressable changer

- **WHEN** neither the review record nor the reviewer session names a changer session
- **THEN** the submission succeeds and no wakeup is sent

#### Scenario: A wakeup failure keeps the report

- **WHEN** the wakeup delivery throws after the report is written
- **THEN** the submission succeeds and a later `wait` reads the report

### Requirement: The wait deadline wakes the changer

A `wait` that returns `waiting` SHALL schedule a deadline wakeup for that round's `waitMinutes` and record the waiting session as its target. A later submission SHALL cancel it. When the deadline fires and the reviewer slot is still live, the plugin SHALL wake the recorded waiter with an `overdue` message. A later `wait` for the same round SHALL replace any pending deadline.

#### Scenario: The deadline fires

- **WHEN** `waitMinutes` passes with no report
- **THEN** the recorded waiter receives an overdue steer message

#### Scenario: The reviewer slot is not live

- **WHEN** the deadline fires and the reviewer slot is no longer live
- **THEN** no overdue wakeup is sent and a warning is logged

#### Scenario: A submission cancels the deadline

- **WHEN** the reviewer submits before the deadline
- **THEN** no overdue message is sent

#### Scenario: Repeating wait does not duplicate the deadline

- **WHEN** `wait` is called twice in the same round before the deadline
- **THEN** one pending deadline remains for that round

### Requirement: The review records the changer session

`openspec_review` `start`, `resume` and `wait` SHALL record the calling changer session on the review record under the review lock; the latest caller wins, and the submit and deadline wakeups SHALL address it. The `wait` write SHALL be best-effort: lock contention SHALL NOT fail the wait result. When the session is absent, the wakeups SHALL fall back to the reviewer session's parent session, and without either they SHALL skip the wakeup with a logged warning.

#### Scenario: A start records the changer

- **WHEN** `start` runs with the changer agent
- **THEN** the review record stores the changer session id

#### Scenario: A wait records the latest caller

- **WHEN** a second session calls `wait` on an existing review
- **THEN** the review record stores that second session and the submit and deadline wakeups target it

#### Scenario: A lock-contended wait write keeps the result

- **WHEN** the review lock is held while `wait` records the caller
- **THEN** `wait` logs the skipped write and still returns its wait state

#### Scenario: A legacy record has no changer session

- **WHEN** an older review record has no changer session and the reviewer session names a parent
- **THEN** the wakeup targets that parent session

#### Scenario: No changer identity is available

- **WHEN** the record has no changer session and the reviewer has no parent session
- **THEN** the submission succeeds without a wakeup and logs a warning
