# Spec Delta

## MODIFIED Requirements

### Requirement: Self-review writes the draft report

With `reviewers: 0`, `openspec_review` with `action: "self-report"` SHALL accept one report from the changer and write it as the round report. It SHALL reject a report with empty required fields, an unknown verdict, severity or axis, a mismatched finding id, a blocking finding without impact, rule or failure, or a contradictory verdict; text length and entry count SHALL NOT affect validity. After a report is accepted, it SHALL reject a second report for the same round.

#### Scenario: Self-review report is accepted

- **WHEN** the changer submits a valid report for the current draft round
- **THEN** the report is stored and the review status reflects its verdict

#### Scenario: Second report is refused

- **WHEN** the changer submits another report for a round that already has one
- **THEN** the call fails and the first report remains authoritative

#### Scenario: Long field text is accepted

- **WHEN** a report carries a finding whose `problem` or `evidence` exceeds 120 characters
- **THEN** the report is stored without a length error

#### Scenario: Many out-of-scope entries are accepted

- **WHEN** a report carries four or more `outOfScope` or `residualRisks` entries
- **THEN** the report is stored without a count error

### Requirement: Reviewer failures can be handled without a new round

`openspec_review` SHALL accept `retry`, `replace` and `waive-reviewer` for the single slot. `retry` SHALL message the same reviewer, `replace` SHALL start a new reviewer and record the reason, and `waive-reviewer` SHALL require user approval and mark the coverage gap. `retry` and `replace` SHALL NOT be limited by a count; each call SHALL append to the slot's retry count or replacement history.

#### Scenario: A blocked reviewer is replaced

- **WHEN** the user replaces a blocked reviewer
- **THEN** the slot names the new child id and keeps the round number

#### Scenario: Reviewer coverage is waived

- **WHEN** the user waives the reviewer
- **THEN** the review may become ready only through the coverage-gap path

#### Scenario: A reviewer is retried twice

- **WHEN** the changer calls `retry` twice for the same reviewer
- **THEN** both calls message that reviewer and the slot records two retries

#### Scenario: A reviewer is replaced twice

- **WHEN** the changer calls `replace` twice
- **THEN** each call starts a new reviewer and the replacement history holds both entries
