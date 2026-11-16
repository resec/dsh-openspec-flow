# Delta for development-workflow

## MODIFIED Requirements

### Requirement: Verification gates a change

The repository SHALL require strict OpenSpec validation and one verification command before a change is considered complete. That command SHALL run the plugin test suite and the coverage gate in a single instrumented run, so a separate plain test pass is never required. Strict validation SHALL treat every warning as a failure.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec_validate` passes with `strict: true`
- **AND** `npm run verify` passes on Node 24
- **AND** its output carries both the test summary and the coverage verdict

#### Scenario: The instrumented run fails a test

- **WHEN** a test fails during the verification run
- **THEN** `npm run verify` exits nonzero before the coverage gate is evaluated

#### Scenario: A validation warning is present

- **WHEN** the change or a main spec reports a warning
- **THEN** strict validation fails and the change is not complete

### Requirement: OpenSpec CLI upgrades follow a documented procedure

The repository SHALL document one upgrade procedure for the `@fission-ai/openspec` pin and SHALL follow it for every upgrade. The procedure MUST state the target release's declared Node floor, the CLI coupling inventory, the files to edit, the test matrix, the release step and the rollback step. The guide SHALL describe that procedure and the current pin only; it SHALL NOT record a completed upgrade's version-to-version changes, measurements or outcomes.

#### Scenario: An upgrade starts with the target release facts

- **WHEN** a maintainer decides to upgrade the pinned CLI
- **THEN** the maintainer records the target version's release notes and CHANGELOG entries
- **AND** records its declared `engines.node` and the `schemaVersion` reported by `version --json`

#### Scenario: The edit sequence follows the guide

- **WHEN** the upgrade proceeds past the decision
- **THEN** the dependency, lockfile, version assertions, skill metadata and README are updated in the order the guide states
- **AND** each edit names the file that carries the old version

#### Scenario: An upgrade is verified and can be rolled back

- **WHEN** the upgrade edits are complete or rejected
- **THEN** the contract check, `npm run verify` and `openspec validate` pass before release
- **AND** a rejected upgrade restores the previous pin and documentation and reruns the same checks

#### Scenario: The guide carries no upgrade record

- **WHEN** a maintainer finishes an upgrade and updates the guide
- **THEN** the guide's content remains the procedure and the current pin
- **AND** no section records that upgrade's version-to-version changes, measurements or outcomes
- **AND** the upgrade's evidence lives in the change artifacts and commit history
