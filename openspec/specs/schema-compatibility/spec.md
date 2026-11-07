# Schema Compatibility Specification

## Purpose

Defines the schema support boundary for the plugin's OpenSpec tools.

## Requirements

### Requirement: Only the built-in spec-driven schema is accepted

The plugin SHALL accept a change only when the change's resolved schema is the CLI's built-in `spec-driven` schema.

#### Scenario: Built-in schema is accepted

- **WHEN** `openspec_status`, `openspec_apply_next`, or `openspec_validate` is called for a change whose schema name is `spec-driven` and no project or user schema shadows the built-in
- **THEN** the call proceeds with its normal result

#### Scenario: Custom schema is rejected

- **WHEN** a tool is called for a change whose schema name is not `spec-driven`
- **THEN** the call fails before returning projected status or apply state
- **AND** the error names the change, the schema, and the supported schema

### Requirement: Shadowed spec-driven schemas are rejected

The plugin SHALL reject a change whose `spec-driven` schema resolves from a project-local or user-level schema directory instead of the CLI package.

#### Scenario: Project schema shadows the built-in

- **WHEN** `<project>/openspec/schemas/spec-driven/schema.yaml` exists
- **THEN** a tool call for a change using `spec-driven` fails
- **AND** the error names the shadow path

#### Scenario: User schema shadows the built-in

- **WHEN** the user schema directory contains `spec-driven/schema.yaml`
- **THEN** a tool call for a change using `spec-driven` fails
- **AND** the error names the shadow path

### Requirement: Validation uses the same schema gate

The plugin SHALL apply the schema gate to `openspec_validate` as well as the apply tools, so a custom or shadowed schema cannot be validated as a supported schema.

#### Scenario: Validation rejects a custom schema

- **WHEN** `openspec_validate` is called for a change whose schema is not the built-in `spec-driven`
- **THEN** the call fails with the schema error instead of returning validation findings

### Requirement: Schema rejection is actionable

A schema rejection MUST identify the change, the resolved schema name, the source of the shadow when applicable, and a recovery action.

#### Scenario: Error explains recovery

- **WHEN** a schema rejection is returned
- **THEN** the message names the change and schema
- **AND** it tells the caller to remove the schema selection or the shadowing schema directory

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
