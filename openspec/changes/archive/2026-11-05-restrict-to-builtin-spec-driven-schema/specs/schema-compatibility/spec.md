# Schema Compatibility Delta

## Purpose

Defines the schema support boundary for the plugin's OpenSpec tools.

## ADDED Requirements

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
