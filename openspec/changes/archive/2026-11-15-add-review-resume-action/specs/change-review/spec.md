# Spec Delta

## MODIFIED Requirements

### Requirement: Draft review validates artifacts before starting

`openspec_review` with `action: "start"` and `review: "draft"` SHALL require that no draft review record exists, the change artifacts, an intent string and a passing `openspec validate` result. It SHALL reject a change whose planning artifacts are incomplete or invalid. When a draft review record already exists, it SHALL refuse the start and name `openspec_review` with `action: "resume"`.

#### Scenario: Artifacts are valid

- **WHEN** the change has a valid proposal, specs, design, tasks and intent
- **THEN** the start returns a review id, round and artifact hash

#### Scenario: Validation fails

- **WHEN** the bundled validator reports a finding for the change
- **THEN** the start fails and returns the validator findings

#### Scenario: Intent is missing

- **WHEN** the start is called without an intent string
- **THEN** the start fails and asks for the user's goal and acceptance conditions

#### Scenario: The draft review already started

- **WHEN** a draft review record exists and `start` is called again
- **THEN** the call fails, names `openspec_review` with `action: "resume"` and leaves `intent.md` unchanged

### Requirement: Apply review binds the reviewed draft artifacts

An apply review SHALL require that the change artifacts inside the current tree still match the draft review's recorded artifact hash. A mismatch SHALL refuse the start or resume and ask for a fresh draft review or a corrected commit.

#### Scenario: Applied tree matches the draft

- **WHEN** the current change artifacts equal the draft artifact hash
- **THEN** the apply review may start or resume

#### Scenario: Applied tree changed the plan

- **WHEN** an artifact differs from the draft hash
- **THEN** the apply review start or resume fails

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

## ADDED Requirements

### Requirement: Resume continues a recorded review

`openspec_review` with `action: "resume"` SHALL continue a draft or apply review that has a record. It SHALL refuse a review with no record and name `openspec_review` with `action: "start"`. It SHALL open a new round when the latest round has a report, reuse the latest round when it has no report, return the recorded brief when a passing review already matches the current object, and refuse an abandoned review.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft round has a report and `resume` is called
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report and `resume` is called
- **THEN** the round number does not change and the recorded brief stays the one being reviewed

#### Scenario: A passing review returns its brief

- **WHEN** the review passed on the current object and `resume` is called
- **THEN** the recorded brief is returned and no new round is recorded

#### Scenario: An abandoned review is refused

- **WHEN** the recorded review is abandoned and `resume` is called
- **THEN** the call fails and states that the review was abandoned

#### Scenario: Resume without a record is refused

- **WHEN** `resume` is called for a change with no record of that review
- **THEN** the call fails and names `openspec_review` with `action: "start"`

### Requirement: The draft intent is written once

The first draft `start` SHALL write `intent.md` and bind its hash into the review object. `resume` SHALL read that file, SHALL NOT rewrite it and SHALL refuse an `intent` argument. It SHALL refuse a file whose hash differs from the recorded intent hash. After the first start, the draft object hash SHALL change only through the change artifacts.

#### Scenario: Resume keeps the recorded intent

- **WHEN** `resume` opens another draft round
- **THEN** `intent.md` keeps its bytes and the new round binds the same intent hash

#### Scenario: Resume refuses an intent argument

- **WHEN** `resume` is called with a non-empty `intent`
- **THEN** the call fails, names `openspec_review` with `action: "start"` and leaves the recorded intent unchanged

#### Scenario: Resume refuses an edited intent file

- **WHEN** `intent.md` no longer hashes to the recorded intent hash
- **THEN** the call fails and asks for the review record to be removed before the draft review starts again
