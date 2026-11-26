# Spec Delta

## ADDED Requirements

### Requirement: A blocked draft attempt does not consume a round

A draft resume that finds its latest attempt unreported or blocked SHALL NOT open a new round. It SHALL archive that attempt as a revision and refresh the same round when the object differs or the attempt was blocked. A blocked report SHALL NOT conclude the round and its findings SHALL NOT enter the finding lifecycle. Only a `pass` or `changes-requested` report SHALL end the attempt.

#### Scenario: A stale attempt keeps its round number

- **WHEN** the artifacts change during an open draft round without a substantive report
- **THEN** `resume` refreshes that round and its number is unchanged

#### Scenario: A blocked attempt keeps its round number

- **WHEN** the reviewer submits a blocked report and `resume` runs
- **THEN** the blocked attempt is archived and the same round is refreshed

#### Scenario: A substantive report opens the next round

- **WHEN** the latest attempt carries a `pass` or `changes-requested` report and no finding is open
- **THEN** `resume` records the next round and the round number advances

#### Scenario: A blocked report adds no finding to the record

- **WHEN** a blocked report carries findings
- **THEN** the report file keeps them and the recorded finding list is unchanged

### Requirement: A blocked draft round keeps its audit

Every archived draft attempt SHALL remain readable under `round-N/revisions/MM/`: the previous brief, its hashes, an optional blocked report, the cause, any watch notice and the archive time. The record SHALL carry the same facts in a `revisions` array. Archiving SHALL NOT change recorded findings or their statuses.

#### Scenario: The archive keeps the previous brief

- **WHEN** an attempt is archived
- **THEN** `round-N/revisions/MM/brief.md` holds the brief that version was reviewed against

#### Scenario: The archive keeps a blocked report

- **WHEN** the archived attempt carries a blocked report
- **THEN** `round-N/revisions/MM/report.json` holds that report and the record names its path, verdict and hash

#### Scenario: The archive names the cause

- **WHEN** an attempt is archived
- **THEN** its revision records the object hash, artifact hash, cause and archive time

#### Scenario: The audit stays readable after the review finishes

- **WHEN** the review later passes or is archived
- **THEN** every recorded revision and its files remain readable

### Requirement: Draft readiness treats a blocked attempt as unreported

The draft review SHALL be ready only with a valid `pass` report, verified or waived blocking findings, every finding disposed, no blocking length or execution result, and a matching hash. A `blocked` draft report SHALL count as an unreported attempt: it SHALL NOT satisfy the report requirement, and the next action SHALL name a draft `resume`. Apply SHALL be refused while an enabled draft review is not ready; after apply starts, apply review rechecks both results.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no open blocker, no blocking length or execution result and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: Blocking length result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking length result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Blocking execution result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking execution result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Open blocker blocks apply

- **WHEN** the latest report has an open major finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` as the next step

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` does not require a draft review

#### Scenario: Legacy change has no policy

- **WHEN** a change predates the review policy and no policy file exists
- **THEN** `openspec_apply_next` does not enforce the gate before the first review start

#### Scenario: Apply started ignores the artifact drift

- **WHEN** apply started and the change artifacts no longer equal the draft record hash
- **THEN** the draft review readiness no longer reports the hash mismatch
- **AND** the next action points at the apply review

#### Scenario: A started apply defers the length check

- **WHEN** apply started and the current artifacts carry a blocking length result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: A started apply defers the execution check

- **WHEN** apply started and the current artifacts carry a blocking execution result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call

#### Scenario: A blocked report does not make the review ready

- **WHEN** the latest attempt carries a `blocked` report
- **THEN** the draft review is not ready and the next action names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: A refreshed attempt waits for its report

- **WHEN** `resume` archived a blocked report and refreshed the same round
- **THEN** the review is not ready until the reviewer reports on the refreshed brief

### Requirement: Resume refreshes an unreported or blocked draft attempt

`openspec_review` with `action: "resume"` SHALL continue a recorded draft or apply review and refuse one without a record. It opens a new round only when the latest attempt has a substantive report and no finding is open. An unreported or blocked draft attempt reuses the same round: an unchanged object keeps it; a changed object or a blocked attempt refreshes it after archiving a revision. It returns a passing brief, refuses an abandoned review, and refuses a draft resume after apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft attempt carries a substantive report, no recorded finding is open, and `resume` is called before apply started
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report, its object hash still matches, and `resume` is called
- **THEN** the round number does not change and the recorded brief stays the one being reviewed

#### Scenario: A stale unreported round is refreshed

- **WHEN** the latest round has no report, its object hash differs, and `resume` is called
- **THEN** the attempt is archived as a revision and the same round is refreshed for the current object
- **AND** no new round is recorded

#### Scenario: A blocked round is refreshed

- **WHEN** the latest round carries a blocked report and `resume` is called
- **THEN** the blocked attempt is archived as a revision and the same round is refreshed
- **AND** no new round is recorded

#### Scenario: A passing review returns its brief

- **WHEN** the review passed on the current object and `resume` is called before apply started
- **THEN** the recorded brief is returned and no new round is recorded

#### Scenario: An abandoned review is refused

- **WHEN** the recorded review is abandoned and `resume` is called
- **THEN** the call fails and states that the review was abandoned

#### Scenario: Resume without a record is refused

- **WHEN** `resume` is called for a change with no record of that review
- **THEN** the call fails and names `openspec_review` with `action: "start"`

#### Scenario: Draft resume after apply started is refused

- **WHEN** apply already started and `resume` with `review: "draft"` is called
- **THEN** the call fails and states that plan changes are reviewed by apply review with a user waiver

### Requirement: The draft watch reports each changed object version

While a draft attempt with `reviewers: 1` has no report, the plugin SHALL watch the change directory and compare its hash with the attempt's hash. On a change it SHALL record one notice for that version and send a `blocked` instruction naming the moved hash. It SHALL keep every notice with its revision, stop at a report (including blocked), an abandoned review or unload, write no report or finding, and log instead of sending when the changer is gone. A refreshed attempt SHALL arm the watch.

#### Scenario: An edit during a round notifies the reviewer once

- **WHEN** the object hash changes while the attempt has no report
- **THEN** one message reaches the slot reviewer and the record carries the notice for that object version
- **AND** a second change to the same object version sends no second message

#### Scenario: A later stale round gets its own notice

- **WHEN** an earlier object version already recorded a notice and a later version changes
- **THEN** that later version sends one notice of its own

#### Scenario: A recorded report stops the watch

- **WHEN** a `pass` or `changes-requested` report is recorded for the round
- **THEN** a later edit sends no message

#### Scenario: A blocked report stops the watch for that version

- **WHEN** a blocked report is recorded for the attempt
- **THEN** the watch stops until `resume` archives it and arms the next version

#### Scenario: The notice writes no review content

- **WHEN** the watch sends its notice
- **THEN** the attempt still has no substantive report until the reviewer submits or a resume archives it

#### Scenario: A watch that cannot be armed leaves the review usable

- **WHEN** the watch cannot be armed or cannot take the review lock
- **THEN** the review call still returns normally and a warning is logged

#### Scenario: A late blocked submission names its round

- **WHEN** the notice's round is no longer current and the reviewer submits `blocked` for that round
- **THEN** the call fails naming the current round and no report is stored

#### Scenario: The changer agent is gone

- **WHEN** the notice is taken and the changer agent can no longer be addressed
- **THEN** the notice is logged and no message is sent
- **AND** a later resume still archives the attempt

#### Scenario: A refreshed round arms a new notice

- **WHEN** `resume` refreshes a blocked attempt
- **THEN** the watch is armed again for the refreshed object version

## MODIFIED Requirements

### Requirement: Each review round wakes the reviewer

For a change with `reviewers: 1`, resuming into a new draft or apply round SHALL wake the review's existing reviewer to read the new brief; it SHALL NOT start another reviewer. Resuming an unreported draft round SHALL NOT wake it again while its object is unchanged; refreshing a blocked draft round SHALL wake the reviewer for the same round. The slot SHALL keep the same agent and record the round it was woken for. `replace` remains the only way to start a new reviewer.

#### Scenario: A new draft round wakes the same reviewer

- **WHEN** the latest draft round has a report and `resume` opens the next draft round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: A new apply round wakes the same reviewer

- **WHEN** the latest apply round has a report and `resume` opens the next apply round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: Resuming an unreported round does not wake again

- **WHEN** the latest round has no report and `resume` reuses it
- **THEN** no wake message is sent and the slot keeps its agent

#### Scenario: Refreshing a blocked round wakes the same reviewer

- **WHEN** the latest draft attempt carries a blocked report and `resume` archives it and refreshes the same round
- **THEN** a wake message is sent to the slot reviewer with the unchanged round number
- **AND** no new reviewer activation starts

#### Scenario: The same reviewer submits for the new round

- **WHEN** the slot reviewer submits a report for the new round
- **THEN** the submission is accepted

#### Scenario: A first round with no slot activates a reviewer

- **WHEN** `start` opens a review with `reviewers: 1` and the record has no reviewer slot
- **THEN** one reviewer activation starts

## REMOVED Requirements

### Requirement: A stale draft round closes as blocked

**Reason**: A stale or blocked attempt now refreshes the same round and keeps its audit; closing it as blocked consumed a round number without a review.

**Migration**: `resume` archives the attempt under `round-N/revisions/MM/`, clears the current blocked report and refreshes round N. Existing records need no migration because the new path reads an absent `revisions` array as empty.

### Requirement: Draft readiness gates apply

**Reason**: Replaced by the readiness requirement that also treats a blocked attempt as unreported.

**Migration**: Readiness still requires a `pass` report and the matching hash; the replacement adds the blocked-attempt rule and keeps the apply and execution-preflight gates.

### Requirement: Resume continues a recorded review

**Reason**: Replaced by the resume requirement that names the substantive-report condition and the same-round refresh.

**Migration**: Resume still refuses a missing record, returns a passing brief, refuses an abandoned review and a draft resume after apply; it now refreshes an unreported or blocked attempt instead of opening a round.

### Requirement: The draft round watch notifies the reviewer

**Reason**: Replaced by the watch requirement that reports each changed object version and keeps every notice with its revision.

**Migration**: The watch still sends one message per changed object with a `blocked` instruction; a refreshed round arms a new notice instead of relying on the round number for deduplication.
