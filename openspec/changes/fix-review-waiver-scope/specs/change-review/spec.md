# Spec Delta

## MODIFIED Requirements

### Requirement: A waived reviewer is a coverage gap

A record with a user-waived reviewer SHALL skip the missing-report requirement for the round and object the waiver was approved on, but SHALL still require the artifact or tree hash, finding dispositions and a passing verdict from the remaining review content. A later round, or the same round bound to another object, SHALL need its own passing report.

#### Scenario: Waived reviewer with no findings

- **WHEN** the reviewer is waived and no finding is open
- **THEN** readiness may pass with `coverageGap`

#### Scenario: Waived reviewer with an open blocker

- **WHEN** an open critical or major finding exists
- **THEN** readiness still fails

#### Scenario: A later round passes only on its own verdict

- **WHEN** the waiver was approved for an earlier round and the latest round's report is `blocked` or `changes-requested` with no open finding
- **THEN** readiness fails and names the latest verdict
- **AND** the next action is not `openspec_apply_next`

#### Scenario: A later round without a report is not ready

- **WHEN** the latest round is later than the waived round and has no report
- **THEN** readiness fails with the missing report
- **AND** `wait` returns `waiting` or `overdue` instead of `ready`

#### Scenario: A report on the waived round still needs a passing verdict

- **WHEN** the waived round gains a report whose verdict is not `pass`
- **THEN** readiness fails and names that verdict

#### Scenario: A round opened after a waiver wakes the reviewer

- **WHEN** `resume` opens a round after the waived one
- **THEN** the slot reviewer receives the wake message for the new round
- **AND** a later `waive-reviewer` approved for that round covers it
