# tool-surface Specification

## ADDED Requirements

### Requirement: Instructions carry project configuration

`openspec_instructions` SHALL return the project `context` and the requested artifact's `rules` from `openspec/config.yaml` when they are configured, and SHALL omit each field when it is empty. With `artifact: "archive"`, the tool SHALL return the archive operation inputs instead of artifact fields: `change`, `artifact: "archive"`, `context` when configured, `guidance` when configured, and `root` when reported.

#### Scenario: Artifact instruction includes project context and rules

- **WHEN** `openspec_instructions` reads `proposal` for a project whose `openspec/config.yaml` sets `context` and `rules.proposal`
- **THEN** the result contains `context` with the configured text
- **AND** the result contains `rules` with the configured proposal rules in order
- **AND** the artifact fields `instruction`, `outputPath`, `dependencies` and `unlocks` remain present

#### Scenario: Artifact instruction without project configuration

- **WHEN** `openspec_instructions` reads an artifact for a project without `context` or matching `rules`
- **THEN** the result omits `context` and `rules`
- **AND** the artifact fields are unchanged

#### Scenario: Archive instruction returns operation inputs

- **WHEN** `openspec_instructions` reads `archive` for a project whose `openspec/config.yaml` sets `context` and `operations.archive.guidance`
- **THEN** the result contains `change`, `artifact: "archive"`, `context` and `guidance`
- **AND** the result does not contain `schema`, `outputPath`, `instruction`, `dependencies` or `unlocks`

#### Scenario: Archive instruction without project configuration

- **WHEN** `openspec_instructions` reads `archive` for a project without `context` or archive guidance
- **THEN** the result contains `change`, `artifact: "archive"` and `root`
- **AND** the result omits `context` and `guidance`

### Requirement: Apply carries project configuration

`openspec_apply_next` SHALL return the apply operation's `context` and `guidance` from `openspec/config.yaml` when they are configured, and SHALL omit each field when it is empty.

#### Scenario: Apply state includes context and guidance

- **WHEN** `openspec_apply_next` reads a change for a project whose `openspec/config.yaml` sets `context` and `operations.apply.guidance`
- **THEN** the result contains `context` with the configured text
- **AND** the result contains `guidance` with the configured apply guidance in order
- **AND** the existing state, progress, next task and context files remain present

#### Scenario: Apply state without project configuration

- **WHEN** `openspec_apply_next` reads a change for a project without `context` or apply guidance
- **THEN** the result omits `context` and `guidance`
- **AND** the projected apply state is unchanged
