# development-workflow Delta

## ADDED Requirements

### Requirement: Test fixtures use canonical temporary paths

The plain, scoped and coverage test entrypoints SHALL pass the child test process a `TMPDIR` equal to the canonical path of the host temporary directory. A fixture root SHALL equal the path a child process reports for the same directory. When the canonical path cannot be resolved, the entrypoint SHALL keep the inherited value. The normalization SHALL NOT change an outcome on a host whose temporary directory is already canonical.

#### Scenario: The temporary directory is a symlink

- **WHEN** a test creates a fixture under a temporary directory reached through a symlink
- **THEN** the fixture root and the path a child process reports for that directory compare equal
- **AND** the suite passes

#### Scenario: The temporary directory is already canonical

- **WHEN** the host temporary directory has no symlink component
- **THEN** the test result is unchanged

#### Scenario: The canonical path cannot be resolved

- **WHEN** resolving the temporary directory fails
- **THEN** the entrypoint keeps the inherited value
- **AND** the run continues

### Requirement: Agent instructions scope the push path to the maintainer

`AGENTS.md` SHALL state that the post-archive push to `origin/main` is the maintainer's step and that an external contribution stops at its pull request. The archive step SHALL NOT read as an instruction for an external contributor to push.

#### Scenario: An external contributor reads the workflow

- **WHEN** an external contributor follows `AGENTS.md`
- **THEN** the push step names the maintainer as its owner
- **AND** the contributor follows `CONTRIBUTING.md` and stops at the pull request

#### Scenario: The maintainer archives a change

- **WHEN** the maintainer archives a change
- **THEN** the maintainer commits the archive and pushes `origin/main`
