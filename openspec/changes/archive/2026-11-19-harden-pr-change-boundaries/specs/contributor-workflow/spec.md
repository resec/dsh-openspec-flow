## MODIFIED Requirements

### Requirement: Every pull request carries an active change

Every pull request SHALL add or update exactly one active change under `openspec/changes/<name>/` and SHALL NOT archive that change. The change's `tasks.md` SHALL contain no unchecked task when the pull request is opened.

#### Scenario: Code arrives without a change

- **WHEN** a pull request changes code without touching an active change
- **THEN** CI rejects the pull request

#### Scenario: Two active changes arrive

- **WHEN** a pull request touches two active change directories
- **THEN** CI rejects the pull request
- **AND** the error names both changes

#### Scenario: A task is unchecked

- **WHEN** the touched change's `tasks.md` contains an unchecked task
- **THEN** CI rejects the pull request

#### Scenario: A change is archived in the pull request

- **WHEN** a pull request moves or deletes a change under `openspec/changes/archive/`
- **THEN** CI rejects the pull request
