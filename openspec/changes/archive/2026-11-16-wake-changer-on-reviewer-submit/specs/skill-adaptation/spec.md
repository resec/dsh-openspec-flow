# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow skills wait for the independent reviewer

The propose, apply and archive skills SHALL branch on `reviewers`. With `reviewers: 1` they SHALL start or resume the review, call `wait`, end the current turn when `wait` returns `waiting`, and continue only after the reviewer submit, the deadline wakeup, or the user waives the reviewer. With `reviewers: 0` they SHALL keep the self-report path.

#### Scenario: Propose uses a reviewer

- **WHEN** the change sets `reviewers: 1`
- **THEN** the propose skill calls `start` for the first round or `resume` for a later round, then `wait`, and does not submit a self-report

#### Scenario: Apply uses a reviewer

- **WHEN** the apply review sets `reviewers: 1`
- **THEN** the apply skill commits, starts or resumes the review and waits

#### Scenario: A waiting result ends the turn

- **WHEN** `wait` returns `waiting`
- **THEN** the skill does not call `wait` again and ends the turn until the wakeup arrives

#### Scenario: A waived reviewer continues

- **WHEN** the user approves `waive-reviewer`
- **THEN** the skill continues without waiting for a reviewer submit

#### Scenario: Self-review is unchanged

- **WHEN** the change sets `reviewers: 0`
- **THEN** the skill submits `self-report`
