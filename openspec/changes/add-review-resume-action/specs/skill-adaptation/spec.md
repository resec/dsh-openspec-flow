# Spec Delta

## MODIFIED Requirements

### Requirement: Propose runs the draft review before presenting

The shipped propose skill SHALL run the draft review after validating the planning artifacts and before presenting the proposal to the user. It SHALL start the first round, read the returned brief, resume later rounds, write the self-review report when `reviewers` is 0, and stop when the review is not ready.

#### Scenario: Propose reaches the review gate

- **WHEN** the propose skill has written and validated the planning artifacts
- **THEN** it calls `openspec_review` with `action: "start"` and `review: "draft"` before presenting the proposal

#### Scenario: A later round resumes

- **WHEN** a draft review record already exists and the skill must run another round
- **THEN** it calls `openspec_review` with `action: "resume"` and no intent

#### Scenario: Self-review is required

- **WHEN** the change policy sets `reviewers: 0`
- **THEN** the skill tells the changer to read the returned brief and submit `self-report` with the review findings

#### Scenario: Review is not ready

- **WHEN** the draft review reports a blocker
- **THEN** the skill revises the artifacts and resumes another round instead of presenting the proposal

### Requirement: Apply finishes with an apply review

The shipped apply skill SHALL run the apply review after the last task and before reporting completion. It SHALL commit the implementation, start the first round, read the brief, resume later rounds, submit the self-review report when `reviewers` is 0, and stop while the review is not ready. It SHALL start the review when no policy is locked in a git project so the first start locks one. It SHALL skip the review only when the project has no git repository or when a locked policy disables it, stating which.

#### Scenario: Apply reaches the review gate

- **WHEN** every task is complete, the implementation is committed and apply review is available
- **THEN** the skill calls `openspec_review` with `action: "start"` and `review: "apply"` before reporting completion

#### Scenario: An apply round resumes

- **WHEN** the apply review already has a record and the skill must run another round
- **THEN** it calls `openspec_review` with `action: "resume"` and no intent

#### Scenario: Apply review is not ready

- **WHEN** the apply review reports a blocker
- **THEN** the skill fixes the finding and resumes another round instead of reporting completion

#### Scenario: Apply review is unavailable

- **WHEN** the project has no git repository or a locked policy disables apply review
- **THEN** the skill reports that the review cannot run and continues without one

#### Scenario: Apply has no locked policy

- **WHEN** a git project's change has no review policy yet
- **THEN** the skill starts the apply review so the first start locks a policy

#### Scenario: The first start locks a disabled policy

- **WHEN** a git project's change has no policy and the settings disable apply review
- **THEN** the first start locks a disabled policy and the skill reports that the review cannot run and continues

### Requirement: Workflow skills wait for the independent reviewer

The propose, apply and archive skills SHALL branch on `reviewers`. With `reviewers: 1` they SHALL start or resume the review, call `wait`, and continue only after the reviewer submits or the user waives it. With `reviewers: 0` they SHALL keep the self-report path.

#### Scenario: Propose uses a reviewer

- **WHEN** the change sets `reviewers: 1`
- **THEN** the propose skill calls `start` for the first round or `resume` for a later round, then `wait`, and does not submit a self-report

#### Scenario: Apply uses a reviewer

- **WHEN** the apply review sets `reviewers: 1`
- **THEN** the apply skill commits, starts or resumes the review and waits

#### Scenario: Self-review is unchanged

- **WHEN** the change sets `reviewers: 0`
- **THEN** the skill submits `self-report`
