# Spec Delta

## ADDED Requirements

### Requirement: OpenSpec CLI upgrades follow a documented procedure

The repository SHALL document one upgrade procedure for the `@fission-ai/openspec` pin and SHALL follow it for every upgrade. The procedure MUST state the target release's declared Node floor, the CLI coupling inventory, the files to edit, the test matrix, the release step and the rollback step.

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

### Requirement: The CLI contract check fails on projection-breaking differences

The repository SHALL provide a development-only contract check that compares the JSON shape of the pinned CLI with a candidate CLI over one fixed fixture project and SHALL fail when a field the plugin reads is missing or has a changed type.

#### Scenario: A compatible candidate passes

- **WHEN** the candidate CLI returns every consumed field with the same type and only adds fields
- **THEN** the check exits zero and lists the added paths

#### Scenario: A projection-breaking candidate fails

- **WHEN** the candidate CLI omits a consumed field or changes its type
- **THEN** the check exits non-zero and names the command and the JSON path

#### Scenario: The candidate is checked without network access

- **WHEN** the check is given a local candidate binary
- **THEN** it runs both CLIs without contacting the npm registry

#### Scenario: A fixture command fails

- **WHEN** either CLI fails a fixture command
- **THEN** the check reports the command, exit code and stderr
- **AND** exits non-zero
