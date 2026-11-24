# development-workflow delta

## MODIFIED Requirements

### Requirement: Test fixtures use canonical temporary paths

The plain, scoped and coverage test entrypoints SHALL pass the child test process a `TMPDIR` that is a per-run root under the canonical path of the host temporary directory. A fixture root SHALL equal the path a child process reports for the same directory. When the canonical path cannot be resolved, the entrypoint SHALL keep the inherited value and SHALL run without a run root. The normalization SHALL NOT change an outcome on a host whose temporary directory is already canonical.

#### Scenario: The temporary directory is a symlink

- **WHEN** a test creates a fixture under a temporary directory reached through a symlink
- **THEN** the fixture root and the path a child process reports for that directory compare equal
- **AND** the suite passes

#### Scenario: The temporary directory is already canonical

- **WHEN** the host temporary directory has no symlink component
- **THEN** the test result is unchanged

#### Scenario: The canonical path cannot be resolved

- **WHEN** resolving the temporary directory fails
- **THEN** the entrypoint passes the inherited value to the test process and runs without a run root
- **AND** the run continues

## ADDED Requirements

### Requirement: A run removes its temporary root

When the canonical base resolves, the plain and scoped entrypoints SHALL create one temporary root per run, pass it as `TMPDIR`, and remove it when the run ends, whether tests pass, fail, or the run receives `SIGINT`/`SIGTERM`. The coverage entrypoint SHALL inherit that lifecycle from the runner it starts. `DSH_TEST_KEEP_TMP=1` SHALL keep the root and report its path; a listing run SHALL create none; a cleanup failure SHALL be reported without changing the exit status.

#### Scenario: A passing run removes its root

- **WHEN** every test passes and the run exits
- **THEN** the run root no longer exists

#### Scenario: A failing run removes its root

- **WHEN** at least one test fails and the run exits nonzero
- **THEN** the run root no longer exists
- **AND** the run's exit status is unchanged

#### Scenario: An interrupted run removes its root

- **WHEN** the run receives `SIGINT` or `SIGTERM`
- **THEN** the run root is removed before the process exits
- **AND** the entrypoint exits with the conventional `128 + signal` status

#### Scenario: The keep switch keeps the root

- **WHEN** the run sets `DSH_TEST_KEEP_TMP=1`
- **THEN** exactly one run root is left and its path is reported

#### Scenario: A listing run creates no root

- **WHEN** the scoped entrypoint lists its selection without running tests
- **THEN** no run root is created

#### Scenario: A run without a resolved base keeps the inherited value

- **WHEN** the canonical base cannot be resolved
- **THEN** no run root is created
- **AND** the entrypoint passes the inherited value to the test process

### Requirement: Registered fixtures are removed at file teardown

A test file that registers temporary fixture roots with the shared test-side registry SHALL remove every registered root when the file's tests finish, whether they pass, fail, or stop before their last line. The registry SHALL delete the root the fixture created, including its subdirectories, and SHALL be harmless when a root is already gone.

#### Scenario: A failing test leaves no registered root

- **WHEN** a test whose file registered a fixture root fails and the file's tests finish
- **THEN** that root no longer exists

#### Scenario: A fixture that fails before the test body leaves no registered root

- **WHEN** a fixture registers its root and then throws before the test body runs
- **THEN** the file teardown removes that root

#### Scenario: Subdirectories are removed with the root

- **WHEN** a fixture creates a root with a project tree beneath it
- **THEN** the teardown removes the whole root, not only a descendant directory

#### Scenario: A root already removed by the test is harmless

- **WHEN** a test removes its fixture root through its own cleanup and teardown runs afterwards
- **THEN** teardown reports no failure and the run's exit status is unchanged
