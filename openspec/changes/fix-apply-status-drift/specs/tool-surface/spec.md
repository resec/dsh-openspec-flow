# Tool Surface Delta

## ADDED Requirements

### Requirement: An unwaived plan drift names the waiver before resume

An apply review next action SHALL name `openspec_review action=waive scope=plan-change` while a plan file drifted from the reviewed draft without a user waiver, even when the tree also differs from the recorded tree; it SHALL name `resume` only once the recorded waiver covers every drifted file.

#### Scenario: A drifted plan file and a moved tree name the waiver

- **WHEN** an apply review has a record, no finding is open, the current tree differs from the recorded tree, and a plan file drifted without a user waiver
- **THEN** `nextAction` is `openspec_review action=waive scope=plan-change`
- **AND** it does not name `resume`

#### Scenario: The waiver restores resume

- **WHEN** the recorded plan-change waiver covers every drifted file and no finding is open
- **THEN** `nextAction` is `openspec_review action=resume review=apply`
