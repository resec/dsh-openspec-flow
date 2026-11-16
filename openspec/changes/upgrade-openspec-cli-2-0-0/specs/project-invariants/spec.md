# Spec Delta

## MODIFIED Requirements

### Requirement: OpenSpec CLI pin

The plugin SHALL depend on exactly `@fission-ai/openspec` 2.0.0 and accept only schema envelope version 1.

#### Scenario: The bundled CLI reports another version

- **WHEN** `openspec version --json` reports a different version or schema envelope version
- **THEN** the plugin fails before running the requested command
