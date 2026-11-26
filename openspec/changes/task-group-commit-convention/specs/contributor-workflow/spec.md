# Spec Delta: contributor-workflow

## ADDED Requirements

### Requirement: Contribution document states the task-group commit convention

`CONTRIBUTING.md` SHALL state that each numbered top-level `tasks.md` group that changes files gets its own commit carrying only that group's changes, that the subtasks of one group MAY share a commit, that a group that only runs checks leaves none, and that no CI check enforces the convention.

#### Scenario: A contributor implements the change

- **WHEN** a contributor implements a change on their branch
- **THEN** `CONTRIBUTING.md` tells them each numbered group that changes files gets its own commit carrying only its changes
- **AND** it allows the subtasks of one group to share a commit

#### Scenario: A commit combines two groups

- **WHEN** a contributor's commit carries changed files from two numbered groups
- **THEN** the document's rule does not count it for either group
- **AND** each group still needs its own commit

#### Scenario: A verification-only group is exempt

- **WHEN** a group only runs checks
- **THEN** the document states that it leaves no commit

#### Scenario: The document states that no check enforces it

- **WHEN** a contributor reads the convention
- **THEN** the document says no CI check enforces the rule
