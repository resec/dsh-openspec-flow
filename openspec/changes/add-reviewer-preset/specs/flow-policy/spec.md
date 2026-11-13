# flow-policy Specification Delta

## ADDED Requirements

### Requirement: The rule states the independent reviewer mode

The flow rule SHALL state that `reviewers: 1` starts one independent reviewer, that the changer waits for its report, and that the reviewer is read-only and cannot edit the worktree.

#### Scenario: Reviewers is one

- **WHEN** the change policy sets `reviewers: 1`
- **THEN** the flow rule tells the changer to start the review and wait for the reviewer

#### Scenario: Reviewers is zero

- **WHEN** the change policy sets `reviewers: 0`
- **THEN** the flow rule keeps the self-review path
