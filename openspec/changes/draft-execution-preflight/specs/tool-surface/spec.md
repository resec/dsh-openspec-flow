# Spec Delta

## ADDED Requirements

### Requirement: An execution-preflight block names draft resume

When a draft review has a recorded report, no finding is open, and the only outstanding readiness reason is a blocking execution-preflight result, the next action SHALL name `openspec_review` with `action: "resume"` and `review: "draft"`. It SHALL NOT name `dispose`. When a finding is also open, the next action SHALL still name `dispose` with `review: "draft"`. Before a report is recorded, the next action SHALL keep the round's `wait` or `self-report` action.

#### Scenario: An execution-only block names resume

- **WHEN** a draft record has a recorded report, a blocking execution result, no finding open and the matching artifact hash
- **THEN** the next action is `openspec_review action=resume review=draft`
- **AND** it does not name `dispose`

#### Scenario: Length and execution blocks name resume

- **WHEN** a draft record has a recorded report, blocking length and execution results and no open finding
- **THEN** the next action is `openspec_review action=resume review=draft`

#### Scenario: An unreported round keeps its report action

- **WHEN** a draft record has a blocking execution result and no report is recorded
- **THEN** the next action is `openspec_review action=wait` in reviewer mode or `openspec_review action=self-report` in self mode
- **AND** it does not name `resume` or `dispose`

#### Scenario: An open finding still names dispose

- **WHEN** a draft record has a blocking execution result and an open finding
- **THEN** the next action is `openspec_review action=dispose review=draft`
