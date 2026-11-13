# skill-adaptation Specification Delta

## ADDED Requirements

### Requirement: Propose runs the draft review before presenting

The shipped propose skill SHALL run the draft review after validating the planning artifacts and before presenting the proposal to the user. It SHALL start the review, read the returned brief, write the self-review report when `reviewers` is 0, and stop when the review is not ready.

#### Scenario: Propose reaches the review gate

- **WHEN** the propose skill has written and validated the planning artifacts
- **THEN** it calls `openspec_review` with `action: "start"` and `review: "draft"` before presenting the proposal

#### Scenario: Self-review is required

- **WHEN** the change policy sets `reviewers: 0`
- **THEN** the skill tells the changer to read the returned brief and submit `self-report` with the review findings

#### Scenario: Review is not ready

- **WHEN** the draft review reports a blocker
- **THEN** the skill revises the artifacts and starts another round instead of presenting the proposal
