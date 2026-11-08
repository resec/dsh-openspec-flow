# skill-adaptation Specification

## ADDED Requirements

### Requirement: Workflow skills consume returned project configuration

The shipped workflow skills SHALL tell the agent to use the project `context`, per-artifact `rules` and operation `guidance` returned by the tools. The archive skill SHALL read the archive inputs with `openspec_instructions` before calling `openspec_archive`.

#### Scenario: Propose and update use artifact context and rules

- **WHEN** the propose or update skill writes or revises an artifact
- **THEN** it tells the agent to follow the `context` and `rules` returned by `openspec_instructions` for that artifact

#### Scenario: Apply uses apply context and guidance

- **WHEN** the apply skill reads the result of `openspec_apply_next`
- **THEN** it tells the agent to follow `context` and `guidance` when those fields are present

#### Scenario: Archive reads archive inputs first

- **WHEN** the archive skill starts for a change
- **THEN** it calls `openspec_instructions` with `artifact: "archive"` before `openspec_archive`
- **AND** it tells the agent to follow the returned `context` and `guidance` when present
- **AND** it proceeds when both fields are absent
