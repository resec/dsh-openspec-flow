# Spec Delta

## MODIFIED Requirements

### Requirement: Only the built-in spec-driven schema is accepted

The plugin SHALL accept a change only when the change's resolved schema is the CLI's built-in `spec-driven` schema.

#### Scenario: Built-in schema is accepted

- **WHEN** `openspec_inspect` with `action: "status"`, `action: "validate"` or `openspec_apply_next` is called for a change whose schema name is `spec-driven` and no project or user schema shadows the built-in
- **THEN** the call proceeds with its normal result

#### Scenario: Custom schema is rejected

- **WHEN** a tool is called for a change whose schema name is not `spec-driven`
- **THEN** the call fails before returning projected status or apply state
- **AND** the error names the change, the schema, and the supported schema

### Requirement: Validation uses the same schema gate

The plugin SHALL apply the schema gate to `openspec_inspect` with `action: "validate"` as well as the apply tools, so a custom or shadowed schema cannot be validated as a supported schema.

#### Scenario: Validation rejects a custom schema

- **WHEN** `openspec_inspect` with `action: "validate"` is called for a change whose schema is not the built-in `spec-driven`
- **THEN** the call fails with the schema error instead of returning validation findings
