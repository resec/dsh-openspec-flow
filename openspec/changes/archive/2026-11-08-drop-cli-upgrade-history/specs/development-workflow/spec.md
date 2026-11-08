# Spec Delta

## MODIFIED Requirements

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
- **THEN** the contract check, `npm test`, `npm run coverage:check` and `openspec validate` pass before release
- **AND** a rejected upgrade restores the previous pin and documentation and reruns the same checks

#### Scenario: The guide carries no upgrade record

- **WHEN** a maintainer finishes an upgrade and updates the guide
- **THEN** the guide's content remains the procedure and the current pin
- **AND** no section records that upgrade's version-to-version changes, measurements or outcomes
- **AND** the upgrade's evidence lives in the change artifacts and commit history
