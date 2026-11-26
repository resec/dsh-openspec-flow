# Spec Delta

## ADDED Requirements

### Requirement: Review status reports round revisions

`openspec_review` status for a draft review SHALL report each round's archived attempts: the round, revision number, object hash, cause, archive time and the archived brief and report paths. Its output schema SHALL declare the optional `revisions` array. The summary SHALL NOT include the archived report body; the paths allow reading it.

#### Scenario: A status read lists an archived attempt

- **WHEN** a draft round carries one archived attempt and `status` runs
- **THEN** the result names that attempt's revision, cause, object hash and archive time

#### Scenario: A blocked attempt names its archived report

- **WHEN** the archived attempt carried a blocked report
- **THEN** the revision names the report path and verdict

#### Scenario: A review without revisions omits the facts

- **WHEN** no attempt was archived
- **THEN** the result reports no revision entries and the current round fields are unchanged

### Requirement: A blocked draft attempt names resume

When a draft attempt carries a blocked report and no finding is open, the next action SHALL name `openspec_review` with `action: "resume"` and `review: "draft"`. An unchanged unreported attempt SHALL keep the round's `wait` or `self-report` action.

#### Scenario: A blocked attempt names resume

- **WHEN** the latest draft report is `blocked` and no finding is open
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: An unchanged unreported attempt keeps its wait

- **WHEN** the latest draft attempt has no report and its object hash is unchanged
- **THEN** `nextAction` is the round's `wait` action in reviewer mode or its `self-report` action in self mode
- **AND** it does not name `resume`

### Requirement: A blocked draft submit is stored for the current round

In a draft review, while the current object hash differs from the round's hash, `openspec_reviewer` submit SHALL accept only a `blocked` report with no findings, stored with the stale-object cause and both hashes, then the normal wakeup. A blocked draft report SHALL NOT enter the finding lifecycle. Any other verdict or a blocked report with findings SHALL be refused without storing it and SHALL name `blocked`. An unchanged object and apply reviews keep their submit path.

#### Scenario: A blocked submission stores the stale attempt

- **WHEN** the reviewer submits a `blocked` report with no findings while the draft object hash differs from the round's hash
- **THEN** the report is stored with the stale-object cause and both hashes
- **AND** the changer receives the normal submit wakeup

#### Scenario: A pass submission on a stale object is refused

- **WHEN** the reviewer submits a `pass` report while the draft object hash differs from the round's hash
- **THEN** the call fails, the message names `blocked`, and no report is stored

#### Scenario: A blocked submission with findings is refused

- **WHEN** the reviewer submits a `blocked` report that carries findings while the object is stale
- **THEN** the call fails and no report is stored

#### Scenario: A finding awaiting verification does not block the stale submission

- **WHEN** a recorded finding is `fixed` awaiting a later verification and the object goes stale
- **THEN** the blocked submission is stored and the finding stays `fixed`

#### Scenario: An unchanged object keeps the submit path

- **WHEN** the current object hash equals the round's hash, no stale notice is recorded, and the reviewer submits any valid report
- **THEN** the report is stored as before

#### Scenario: A blocked report on an unchanged object adds no finding

- **WHEN** the reviewer submits a blocked report with findings while the object is unchanged
- **THEN** the report file keeps the findings and the recorded finding list is unchanged

#### Scenario: An apply review keeps the submit path

- **WHEN** the apply review's object hash differs from its round's hash and the reviewer submits
- **THEN** the submit is handled as before this change

## REMOVED Requirements

### Requirement: A stale reviewer submit is accepted only as blocked

**Reason**: Replaced by the blocked-submit requirement that states the same stale restriction, keeps the stored report as a draft attempt and excludes it from the finding lifecycle.

**Migration**: A stale submit still accepts only `blocked` with no findings; the replacement adds the unchanged-object blocked case and the finding-lifecycle boundary.
