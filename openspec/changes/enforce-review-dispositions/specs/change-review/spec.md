# Spec Delta

## ADDED Requirements

### Requirement: Dispositions travel only with dispose and waive

`openspec_review` with `action: "start"` or `action: "resume"` SHALL reject a `dispositions` argument and name the action that owns it. The batch SHALL be consumed only by `action: "dispose"` or a finding `action: "waive"`. A refused call SHALL NOT create a review record or advance a round. An empty `dispositions` array SHALL be rejected as well.

#### Scenario: Start carries dispositions

- **WHEN** `start` is called with a `dispositions` array
- **THEN** the call fails and names `action: "dispose"`
- **AND** no review record is created

#### Scenario: Resume carries dispositions

- **WHEN** `resume` is called with a `dispositions` array
- **THEN** the call fails and names `action: "dispose"`
- **AND** the record, round and findings are unchanged

#### Scenario: An empty dispositions array

- **WHEN** `start` or `resume` is called with `dispositions: []`
- **THEN** the call fails before any record is read

#### Scenario: Dispose still accepts the batch

- **WHEN** `action: "dispose"` is called with a valid `dispositions` array
- **THEN** every named finding is disposed as before

### Requirement: Resume refuses a new round while a finding is open

`openspec_review` with `action: "resume"` SHALL NOT open a new round while any recorded finding is still `open`. The refusal SHALL name every open finding id and the `action=dispose` step, and SHALL NOT record a round, change the object hash or wake a reviewer. The gate SHALL apply to draft and apply reviews and to both reviewer modes, and its refusal SHALL win over the round cap.

#### Scenario: An undisposed draft finding blocks the next round

- **WHEN** the latest draft round has a report and a recorded finding is still `open`
- **THEN** the call fails and names every open finding id
- **AND** it names `openspec_review` with `action: "dispose"`
- **AND** no new round is recorded and no reviewer is woken

#### Scenario: An undisposed apply finding blocks the next round

- **WHEN** the latest apply round has a report and a recorded finding is still `open`
- **THEN** the call fails and names every open finding id
- **AND** no new round is recorded

#### Scenario: The open-finding refusal wins over the round cap

- **WHEN** the review is at its round cap and a recorded finding is still `open`
- **THEN** the call fails with the open-finding error, not the cap error

#### Scenario: Disposal clears the gate

- **WHEN** every recorded finding has been disposed after the latest report
- **THEN** `resume` opens the next round

### Requirement: A refused verification reports the finding's current state

When a report carries a verification with status `verified-fixed` for a finding whose recorded status is `open`, `deferred` or `rejected`, the plugin SHALL refuse the report and report that status plus the changer's `openspec_review action=dispose` step with `status=fixed` and a note. When the finding is already `verified` or `waived`, the refusal SHALL say the finding is closed and SHALL NOT direct another disposal.

#### Scenario: An open finding cannot be verified fixed

- **WHEN** a report verifies `R1-01` as `verified-fixed` and the recorded finding is still `open`
- **THEN** the report is refused
- **AND** the error names `open`, `action=dispose` and `status=fixed`

#### Scenario: A deferred finding cannot be verified fixed

- **WHEN** a report verifies a finding as `verified-fixed` and the recorded finding is `deferred`
- **THEN** the report is refused and the error names `deferred`

#### Scenario: A verified finding is already closed

- **WHEN** a report verifies a `verified` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed and does not direct a disposal

#### Scenario: A waived finding is already closed

- **WHEN** a report verifies a `waived` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed

## MODIFIED Requirements

### Requirement: Resume continues a recorded review

`openspec_review` with `action: "resume"` SHALL continue a draft or apply review that has a record. It SHALL refuse a review with no record and name `openspec_review` with `action: "start"`. It SHALL open a new round when the latest round has a report and no recorded finding is open, reuse the latest round when it has no report, return the recorded brief when a passing review already matches the current object, refuse an abandoned review, and refuse a draft resume once apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft round has a report, no recorded finding is open, and `resume` is called before apply started
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report and `resume` is called
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
