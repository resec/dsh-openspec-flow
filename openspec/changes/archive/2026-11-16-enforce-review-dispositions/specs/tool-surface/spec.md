# Spec Delta

## ADDED Requirements

### Requirement: The reviewer reads finding status

`openspec_reviewer` `read` with `target: "findings"` SHALL return each recorded finding's id, severity, status, title, first round, verification round and last verification, plus each round's verdict and whether a report exists. The read SHALL NOT change the review.

#### Scenario: Reviewer reads the finding state

- **WHEN** the reviewer calls `read` with `target: "findings"`
- **THEN** the tool returns every recorded finding's id, severity, status, title, first round, verification round and last verification
- **AND** it returns each round's verdict and whether a report exists

#### Scenario: The finding read does not write

- **WHEN** the reviewer reads `target: "findings"`
- **THEN** the review record's bytes are unchanged

### Requirement: The reviewer reads an earlier report

`openspec_reviewer` `read` with `target: "own-report"` SHALL read the latest round when `round` is absent and the named round when it is present. A round that is not recorded or has no report SHALL fail and name the round.

#### Scenario: Reviewer reads an earlier round report

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a `round` that has a report
- **THEN** the tool returns that round's report

#### Scenario: Reviewer asks for a round without a report

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a `round` that has no report
- **THEN** the call fails and names the round

#### Scenario: Reviewer asks for an unrecorded round

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a round the record does not contain
- **THEN** the call fails and names the round

## MODIFIED Requirements

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start` or `resume` SHALL carry the review kind. It SHALL name `start` when the review has no record; `resume` when a record exists, no finding is open, and either the object differs or a finding is fixed; and `dispose` while any finding is open. Once apply started, a draft next action SHALL name the apply review status, not `resume review=draft`.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose draft review has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded, no finding is open, and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record, no finding is open, and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`

#### Scenario: An open finding names dispose

- **WHEN** a record exists, the object changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose`
- **AND** it does not name `resume`

#### Scenario: Draft status after apply started names the apply review

- **WHEN** `status` for a draft review runs after apply started and the artifacts changed
- **THEN** the next action names the apply review
- **AND** it does not name a draft resume
