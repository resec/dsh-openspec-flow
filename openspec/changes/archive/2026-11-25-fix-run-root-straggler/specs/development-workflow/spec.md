# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: A run stops its descendants before removing the root

On platforms that provide process groups, the plain and scoped entrypoints SHALL stop the group they started before removing the run root, so no descendant remaining in that group can recreate the removed path. On `SIGINT`/`SIGTERM` they SHALL signal the group and kill the remaining members before removal; on a normal run they SHALL kill the group after the runner exits and before removal. A descendant that leaves the group is outside this guarantee. The run's exit status SHALL stay unchanged.

#### Scenario: A normal run leaves no descendant that recreates the root

- **WHEN** a test leaves a child process that creates a path under `TMPDIR` after the runner exits
- **THEN** the entrypoint stops that child before it removes the run root
- **AND** the run root does not exist afterwards
- **AND** the run keeps the runner's exit status

#### Scenario: A signalled run leaves no descendant that recreates the root

- **WHEN** the run receives `SIGTERM` while a descendant of the runner is still running
- **THEN** the entrypoint signals the group and kills the remaining members before removing the run root
- **AND** the run root does not exist afterwards
- **AND** the entrypoint exits with status 143

#### Scenario: A descendant that ignores SIGTERM does not survive

- **WHEN** a descendant of the runner ignores `SIGTERM`
- **THEN** the entrypoint kills it before removing the run root
- **AND** the run root does not exist afterwards

#### Scenario: A run without a resolved base still stops the group

- **WHEN** the canonical base cannot be resolved and a descendant outlives the runner
- **THEN** the entrypoint stops the group
- **AND** the entrypoint passes the inherited temporary directory value on

#### Scenario: The keep switch keeps only the run root

- **WHEN** the run sets `DSH_TEST_KEEP_TMP=1`
- **THEN** the entrypoint stops the group
- **AND** exactly one run root is left in place

### Requirement: A platform without process groups signals the direct child only

A platform that provides no process groups SHALL be handled by signalling the direct child only; the entrypoint SHALL NOT promise to stop that child's descendants.

#### Scenario: A platform without process groups signals the direct child

- **WHEN** the host provides no process groups
- **THEN** the entrypoint signals the direct child only
- **AND** the entrypoint attempts no group signal
