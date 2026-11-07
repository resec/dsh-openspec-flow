# tool-surface Specification

## ADDED Requirements

### Requirement: Project-internal paths are relative to the resolved root

Tool output paths that fall under the resolved OpenSpec root SHALL be returned relative to that root, using POSIX separators, with `.` denoting the root itself. Paths outside the root SHALL stay absolute and SHALL NOT be rewritten with leading `..`. Every response that contains relative paths SHALL also carry the absolute `root.path` as their base, except `openspec_mark_task_done`, which inherits the base from the preceding `openspec_apply_next` response.

#### Scenario: Apply returns relative context files

- **WHEN** `openspec_apply_next` returns context files under `/project/openspec/changes/c`
- **THEN** each path is `openspec/changes/c/...`
- **AND** the response carries `root.path` as `/project`

#### Scenario: The root itself is the path

- **WHEN** a projected path equals the resolved root
- **THEN** it is returned as `.`

#### Scenario: Store path stays absolute

- **WHEN** a projected path belongs to a registered store outside the project root
- **THEN** it is returned absolute and is not rewritten with `..`

#### Scenario: Change paths are relative

- **WHEN** `openspec_status`, `openspec_instructions`, `openspec_new_change` or `openspec_archive` returns a change path
- **THEN** paths such as `changeRoot`, `resolvedOutputPath`, `existingOutputPaths`, `change.path`, `change.metadataPath` and `path` are relative to `root.path`

#### Scenario: Mark accepts the relative source path

- **WHEN** `openspec_mark_task_done` receives the relative `sourcePath` returned by `openspec_apply_next`
- **THEN** it resolves that path against the cached project root and verifies the same task

## MODIFIED Requirements

### Requirement: Tool results are projections

Each read tool SHALL return a compact projection of the CLI JSON instead of the full payload, preserving the fields the next step needs. Project-internal paths SHALL follow the relative-path requirement above.

#### Scenario: Status is read

- **WHEN** `openspec_status` reads a change
- **THEN** the result contains schema, artifact completion, next step and edit constraints, with `changeRoot`, `planningHome` and `allowedEditRoots` relative to the returned `root.path`

#### Scenario: Instructions are read

- **WHEN** `openspec_instructions` reads an artifact
- **THEN** the result keeps the instruction text, output path, existing outputs and prerequisites, with `resolvedOutputPath` and `existingOutputPaths` relative to `root.path`, and drops unrelated planning-home internals
