# Spec Delta

## MODIFIED Requirements

### Requirement: Each review round wakes the reviewer

For a change with `reviewers: 1`, resuming into a new draft or apply round SHALL wake the review's existing reviewer to read the new brief; it SHALL NOT start another reviewer. Resuming a round whose reviewer has not submitted SHALL NOT wake it again. The slot SHALL keep the same agent and record the round it was woken for. `replace` remains the only way to start a new reviewer.

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

#### Scenario: The same reviewer submits for the new round

- **WHEN** the slot reviewer submits a report for the new round
- **THEN** the submission is accepted

#### Scenario: A first round with no slot activates a reviewer

- **WHEN** `start` opens a review with `reviewers: 1` and the record has no reviewer slot
- **THEN** one reviewer activation starts

### Requirement: Resume continues a recorded review

`openspec_review` with `action: "resume"` SHALL continue a draft or apply review that has a record. It SHALL refuse a review with no record and name `openspec_review` with `action: "start"`. It SHALL open a new round when the latest round has a report and no recorded finding is open, reuse an unreported round while its object is unchanged, return the recorded brief when a passing review already matches the current object, refuse an abandoned review, and refuse a draft resume once apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft round has a report, no recorded finding is open, and `resume` is called before apply started
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report, its object hash still matches, and `resume` is called
- **THEN** the round number does not change and the recorded brief stays the one being reviewed

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

## ADDED Requirements

### Requirement: A stale draft round closes as blocked

When a draft resume finds the latest round without a report and the current object hash differs from the round's hash, the plugin SHALL record a `blocked` report on that round before opening the next round. The report SHALL carry no findings, SHALL state in its summary that the artifacts changed, and SHALL record the round hash, the current hash and a `stale-object` cause on the round. The close SHALL NOT be validated against recorded findings, and their statuses SHALL NOT change.

#### Scenario: The stale round records a blocked report

- **WHEN** a draft resume runs over changed artifacts and the latest round has no report
- **THEN** that round gains a blocked report with an empty findings list and both hashes
- **AND** the next round opens with the current object hash

#### Scenario: The next round wakes the reviewer

- **WHEN** the stale round is closed and the next round opens
- **THEN** the slot reviewer receives the wake message for the new round

#### Scenario: The blocked report adds no finding

- **WHEN** the plugin records the blocked report
- **THEN** the recorded findings and their statuses are unchanged

#### Scenario: A finding awaiting verification does not block the close

- **WHEN** a recorded finding is `fixed` awaiting a later verification and the round goes stale
- **THEN** the close records the blocked report anyway and the finding stays `fixed`

#### Scenario: An unchanged unreported round is left alone

- **WHEN** a draft resume runs with an unchanged object and no report
- **THEN** no report is recorded and the round keeps its brief

### Requirement: The draft round watch notifies the reviewer

While a draft round with `reviewers: 1` has no report, the plugin SHALL watch the change directory and compare the draft object hash with the round's hash. On a change it SHALL record one notice naming the round and send one message to the slot reviewer with the moved hash and a `blocked` instruction for that round. It SHALL NOT write a report or a finding, SHALL stop at a report, an abandoned review or plugin unload, and SHALL log instead of sending when the changer agent is gone.

#### Scenario: An edit during a round notifies the reviewer once

- **WHEN** the draft object hash changes while the round has no report
- **THEN** one message reaches the slot reviewer and the record carries the notice
- **AND** a second change in the same round sends no second message

#### Scenario: A later stale round gets its own notice

- **WHEN** an earlier round already recorded a notice and a later round's object changes
- **THEN** that later round sends one notice of its own

#### Scenario: A recorded report stops the watch

- **WHEN** a report is recorded for the round
- **THEN** a later edit sends no message

#### Scenario: The notice writes no review content

- **WHEN** the watch sends its notice
- **THEN** the round still has no report until the reviewer submits or a resume closes it

#### Scenario: A watch that cannot be armed leaves the review usable

- **WHEN** the watch cannot be armed or cannot take the review lock
- **THEN** the review call still returns normally and a warning is logged

#### Scenario: A late blocked submission names its round

- **WHEN** the notice's round is no longer current and the reviewer submits `blocked` for that round
- **THEN** the call fails naming the current round and no report is stored

#### Scenario: The changer agent is gone

- **WHEN** the notice is taken and the changer agent can no longer be addressed
- **THEN** the notice is logged and no message is sent
- **AND** a later resume still closes the round
