# Spec Delta

## MODIFIED Requirements

### Requirement: The bundled CLI version is pinned and verified

The plugin SHALL pin `@fission-ai/openspec` to the exact version and schema envelope version recorded in `project-invariants`, and verify the executable before running any command.

#### Scenario: Matching version

- **WHEN** `openspec version --json` reports the registry's version and schema envelope version
- **THEN** the command proceeds

#### Scenario: Mismatched version

- **WHEN** `openspec version --json` reports a different version or schema envelope version
- **THEN** the plugin fails before running the requested command
- **AND** the error names the pinned version and the reported version
