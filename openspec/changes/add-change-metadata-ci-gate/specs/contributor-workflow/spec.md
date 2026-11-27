# Spec Delta

## ADDED Requirements

### Requirement: The OpenSpec check loads change metadata

`npm run openspec:check` SHALL reject a change whose metadata cannot be loaded. It SHALL run the bundled CLI's `status --change <name> --json` for every active change under `openspec/changes/`, excluding `archive`, and SHALL fail when that command cannot run, exits nonzero, reports an error status, or returns no readable projection. A change with no metadata file SHALL still load through the same check.

#### Scenario: Unparsable metadata fails the check

- **WHEN** an active change's `.openspec.yaml` does not parse, such as a multi-line `goal` cut by a YAML comment
- **THEN** the check exits nonzero
- **AND** the failure names the change and the parser message

#### Scenario: Unknown schema fails the check

- **WHEN** an active change's metadata parses but names a schema the CLI cannot resolve
- **THEN** the check exits nonzero
- **AND** the failure names the change

#### Scenario: Valid metadata passes

- **WHEN** every active change's metadata loads
- **THEN** the check exits zero

#### Scenario: No active change passes

- **WHEN** no active change exists under `openspec/changes/`
- **THEN** the check exits zero

#### Scenario: An unusable CLI fails closed

- **WHEN** the bundled CLI cannot be resolved or executed
- **THEN** the check exits nonzero
- **AND** the failure names the CLI problem
