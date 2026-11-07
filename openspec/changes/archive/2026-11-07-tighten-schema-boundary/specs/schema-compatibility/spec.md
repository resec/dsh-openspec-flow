# Schema Compatibility Delta

## ADDED Requirements

### Requirement: New changes are checked before creation

`openspec_new_change` SHALL verify the project's schema selection before writing. It MUST reject a project configuration whose `schema` is not the built-in `spec-driven`, and MUST reject a shadowed built-in `spec-driven`, without creating a change directory. A rejection MUST name the configured schema, the configuration path when one is involved, and the supported schema.

#### Scenario: Project selects a custom schema

- **WHEN** `openspec/config.yaml` sets `schema` to a value other than `spec-driven`
- **THEN** `openspec_new_change` fails with an unsupported-schema error
- **AND** no change directory is created

#### Scenario: Built-in schema is shadowed

- **WHEN** the built-in `spec-driven` is shadowed by a project or user schema directory
- **THEN** `openspec_new_change` fails with an error naming the shadow path
- **AND** no change directory is created

#### Scenario: Supported schema is created

- **WHEN** the project selects `spec-driven` and the built-in copy is not shadowed
- **THEN** `openspec_new_change` creates the change with `schema: spec-driven`
- **AND** the result reports `spec-driven`
