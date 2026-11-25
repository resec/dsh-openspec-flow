# Spec Delta

## ADDED Requirements

### Requirement: Apply worktree creation prepares its toolchain record

Creating a git apply worktree SHALL run bootstrap's deps-only preparation in that worktree before creation publishes its state. A failed preparation SHALL follow the rollback in "Creation holds the change lock and publishes no partial state" and leave no state. Reusing an active worktree SHALL prepare only when its record is missing or stale.

#### Scenario: A new worktree gets a record

- **WHEN** a git apply worktree is created
- **THEN** deps-only preparation runs in it
- **AND** its record exists before the state is written

#### Scenario: A failed preparation rolls back

- **WHEN** the deps-only preparation fails
- **THEN** the created worktree is removed and a branch this call created is deleted
- **AND** no state is written
- **AND** the error names the failed preparation step

#### Scenario: A valid record is reused

- **WHEN** an active worktree is reused and its record is current
- **THEN** creation skips the preparation

#### Scenario: A stale record is prepared

- **WHEN** an active worktree is reused and its record is missing or stale
- **THEN** the preparation runs before the session continues

#### Scenario: A non-git project prepares nothing

- **WHEN** the project has no git worktree
- **THEN** no deps-only preparation runs
