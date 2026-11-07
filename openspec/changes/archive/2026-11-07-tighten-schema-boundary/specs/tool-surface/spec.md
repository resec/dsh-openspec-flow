# Tool Surface Delta

## ADDED Requirements

### Requirement: Schema listing returns only supported schemas

`openspec_schemas` SHALL return only the schemas the plugin supports: the package-provided `spec-driven` schema. It MUST omit custom schemas and project-local or user-level copies that shadow the built-in.

#### Scenario: Only the package schema is returned

- **WHEN** the schema listing reports the package `spec-driven` schema together with other schemas
- **THEN** `openspec_schemas` returns only the package `spec-driven` entry
- **AND** the entry keeps its `source` value

#### Scenario: A shadowed built-in is omitted

- **WHEN** the schema listing reports `spec-driven` from a project or user schema directory
- **THEN** `openspec_schemas` does not return that entry

#### Scenario: A custom schema is omitted

- **WHEN** the schema listing reports a schema whose name is not `spec-driven`
- **THEN** `openspec_schemas` does not return that entry
