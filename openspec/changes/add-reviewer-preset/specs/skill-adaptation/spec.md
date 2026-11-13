# skill-adaptation Specification Delta

## ADDED Requirements

### Requirement: Workflow skills wait for the independent reviewer

The propose, apply and archive skills SHALL branch on `reviewers`. With `reviewers: 1` they SHALL start the review, call `wait`, and continue only after the reviewer submits or the user waives it. With `reviewers: 0` they SHALL keep the self-report path.

#### Scenario: Propose uses a reviewer

- **WHEN** the change sets `reviewers: 1`
- **THEN** the propose skill calls `start`, then `wait`, and does not submit a self-report

#### Scenario: Apply uses a reviewer

- **WHEN** the apply review sets `reviewers: 1`
- **THEN** the apply skill commits, starts the review and waits

#### Scenario: Self-review is unchanged

- **WHEN** the change sets `reviewers: 0`
- **THEN** the skill submits `self-report`
