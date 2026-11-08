# tool-surface delta

## ADDED Requirements

### Requirement: Shared parameter descriptions stay uniform and short

A parameter accepted by multiple tools SHALL use one identical description on every tool. The description SHALL state only what the value is, in at most one short sentence; when and how to pass the value belongs in the shipped skill, not in the JSON Schema. The `store` parameter SHALL be described as `Registered store id.` on every tool that accepts it.

#### Scenario: Store description is uniform

- **WHEN** the tool surface is inspected
- **THEN** every tool exposing `store` describes it as `Registered store id.`
- **AND** no tool repeats store usage guidance in its schema

#### Scenario: A shared description diverges

- **WHEN** a contributor changes one tool's `store` description
- **THEN** `node --test test/` fails and names the mismatching tool
