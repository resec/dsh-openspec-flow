# Spec Delta

## MODIFIED Requirements

### Requirement: Tool results are projections

Each read tool SHALL return a compact projection of the CLI JSON instead of the full payload, preserving the fields the next step needs. Project-internal paths SHALL follow the relative-path requirement above. The status projection SHALL name the artifacts that block planning and SHALL express the next step as tool calls rather than command text.

#### Scenario: Status is read

- **WHEN** `openspec_status` reads a change
- **THEN** the result contains schema, artifact completion, `blockedBy` when planning is incomplete, `nextSteps` as tool actions, and edit constraints
- **AND** `changeRoot`, `planningHome` and `allowedEditRoots` are relative to the returned `root.path`

#### Scenario: Planning is incomplete

- **WHEN** one or more artifacts have status `ready` and `isPlanningComplete` is false
- **THEN** `blockedBy` lists those artifact ids in build order
- **AND** `nextSteps` contains an `openspec_instructions` action for the first ready artifact

#### Scenario: Planning is complete

- **WHEN** `isPlanningComplete` is true
- **THEN** `blockedBy` is absent
- **AND** `nextSteps` contains an `openspec_apply_next` action for the change

#### Scenario: Status is read with a store

- **WHEN** `openspec_status` is called with a store id
- **THEN** every `nextSteps` action carries that store id in its arguments

#### Scenario: Status carries no command text

- **WHEN** `openspec_status` returns a next step
- **THEN** no entry contains a shell command for an OpenSpec operation

#### Scenario: Instructions are read

- **WHEN** `openspec_instructions` reads an artifact
- **THEN** the result keeps the instruction text, output path, existing outputs and prerequisites, with `resolvedOutputPath` and `existingOutputPaths` relative to `root.path`, and drops unrelated planning-home internals
