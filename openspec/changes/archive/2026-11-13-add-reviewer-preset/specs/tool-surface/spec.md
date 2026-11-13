# tool-surface Specification Delta

## ADDED Requirements

### Requirement: The reviewer tool is exposed only through the preset

The plugin SHALL register `openspec_reviewer` only from the `openspec-reviewer` preset entry. The tool SHALL provide `read`, `submit` and `status` for the reviewer slot. The changer's tool catalog SHALL NOT contain `openspec_reviewer`.

#### Scenario: Reviewer reads the brief

- **WHEN** the reviewer calls `read` with `target: "brief"`
- **THEN** the tool returns the current round brief

#### Scenario: Reviewer submits a report

- **WHEN** the reviewer calls `submit` with a valid report
- **THEN** the report is stored for the recorded round and slot

#### Scenario: Changer inspects its catalog

- **WHEN** the changer's catalog is read
- **THEN** it contains `openspec_review` and no `openspec_reviewer`

### Requirement: The reviewer preset is read-only

The `openspec-reviewer` preset SHALL compose `read`, `grep`, `glob` and `openspec_reviewer`. It SHALL NOT compose `bash`, `write`, `edit`, `subagent`, `workflow` or the changer's `openspec_review`.

#### Scenario: Reviewer attempts to use an editing tool

- **WHEN** the reviewer's preset is inspected
- **THEN** it has no editing, shell or delegation tool

#### Scenario: Reviewer reads a spec

- **WHEN** the reviewer needs a main spec
- **THEN** the read and search tools are available
