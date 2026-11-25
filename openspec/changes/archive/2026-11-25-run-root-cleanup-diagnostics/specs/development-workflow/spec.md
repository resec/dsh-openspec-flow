# development-workflow delta

## ADDED Requirements

### Requirement: A failing signal lifecycle assertion reports the entrypoint stderr

When either `SIGTERM` lifecycle test fails its exit-status or run-root assertion, the message SHALL carry the entrypoint's captured stderr rendered as `entrypoint stderr: <text>` truncated to 500 characters, or `entrypoint stderr: <empty>` when nothing was captured. Both tests SHALL capture that stderr; a passing run SHALL be unaffected.

#### Scenario: A leftover run root reports the entrypoint stderr

- **WHEN** a `SIGTERM` run exits and its run root is still present
- **THEN** the failure message carries the stderr the entrypoint wrote
- **AND** the assertion still reports the directory that survived

#### Scenario: An empty capture is labelled

- **WHEN** the entrypoint writes nothing to stderr before a failing assertion
- **THEN** the message reads `entrypoint stderr: <empty>`

#### Scenario: A clean signal run is unchanged

- **WHEN** a `SIGTERM` run removes its root and exits with status 143
- **THEN** the lifecycle test passes

### Requirement: A signal lifecycle capture is read after stderr closes

The `SIGTERM` lifecycle tests SHALL read the captured stderr when the child's stderr closes or 500 milliseconds after the child exits, whichever happens first, so a descendant holding the inherited pipe cannot hang the run.

#### Scenario: A held stderr pipe does not hang the test

- **WHEN** the child's stderr has not closed 500 milliseconds after the child exits
- **THEN** the test reports the capture it has and still asserts

#### Scenario: A late cleanup line is still reported

- **WHEN** the entrypoint writes its cleanup error just before exiting
- **THEN** the reported text includes that line
