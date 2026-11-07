# tool-surface Specification

## Purpose
Defines the agent-facing OpenSpec tool surface: which workflow steps are tools, what each tool returns, how writes are guarded, and how schema and store rules apply. The goal is that an agent never needs to run the OpenSpec CLI directly.

## Requirements

### Requirement: Workflow steps are exposed as tools

The plugin SHALL expose tools covering list, status, instructions, show, context, schemas, store list, validate, apply, task marking, new change, archive and init.

#### Scenario: Agent runs a complete workflow

- **WHEN** an agent proposes, applies and archives a change in an OpenSpec project
- **THEN** every step is performed through an `openspec_*` tool and no `openspec` command is executed by the agent

#### Scenario: Out-of-scope command is requested

- **WHEN** the agent needs a command outside the tool surface, such as `config` or `workset`
- **THEN** the tool surface does not pretend to support it and the skill directs the agent to report the limitation

### Requirement: Tool results are projections

Each read tool SHALL return a compact projection of the CLI JSON instead of the full payload, preserving the fields the next step needs. Project-internal paths SHALL follow the relative-path requirement above.

#### Scenario: Status is read

- **WHEN** `openspec_status` reads a change
- **THEN** the result contains schema, artifact completion, next step and edit constraints, with `changeRoot`, `planningHome` and `allowedEditRoots` relative to the returned `root.path`

#### Scenario: Instructions are read

- **WHEN** `openspec_instructions` reads an artifact
- **THEN** the result keeps the instruction text, output path, existing outputs and prerequisites, with `resolvedOutputPath` and `existingOutputPaths` relative to `root.path`, and drops unrelated planning-home internals

### Requirement: Write tools check preconditions

`openspec_new_change`, `openspec_archive` and `openspec_init` SHALL reject implicit root creation, missing names and unwritable targets before writing.

#### Scenario: Archive without a valid change

- **WHEN** `openspec_archive` is called with a change that fails validation
- **THEN** the tool returns the validation findings and does not move or rewrite files

#### Scenario: Init on a read-only project

- **WHEN** `openspec_init` cannot write the project
- **THEN** it returns an actionable error and leaves the project unchanged

### Requirement: Change-scoped tools enforce the schema gate

Tools that resolve a change schema SHALL reject a schema other than the bundled `spec-driven` copy.

#### Scenario: Custom schema is selected

- **WHEN** a change selects a schema the plugin does not support
- **THEN** status, apply, instructions and validate return the unsupported-schema error instead of running the CLI

### Requirement: Store selection is explicit

Every tool that reads or writes a change SHALL accept an optional store id and pass it to the CLI unchanged.

#### Scenario: Store-scoped change

- **WHEN** a change lives in a registered store
- **THEN** the caller passes the store id on every tool call and the tool does not guess a different root

### Requirement: Errors name the recovery action

Tool failures SHALL return the CLI message plus the action that resolves it, instead of a bare stack trace.

#### Scenario: Missing CLI dependency

- **WHEN** the bundled CLI cannot be resolved
- **THEN** the tool reports that the plugin must be reinstalled and does not fall back to PATH

### Requirement: Tool descriptions name only the tool surface

Every registered tool's JSON Schema description, including nested parameter and result-field descriptions, SHALL describe the data or the action without naming the OpenSpec CLI or a CLI fallback.

#### Scenario: Descriptions are scanned

- **WHEN** the test suite walks every registered tool's parameters and results
- **THEN** no description contains the token `CLI`

#### Scenario: A description is edited

- **WHEN** a contributor adds or changes a tool description that names the CLI
- **THEN** `node --test test/` fails and names the offending tool

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

### Requirement: Task marking accepts a batch

`openspec_mark_task_done` SHALL accept one or more task ids in a single call and SHALL report one result entry per distinct task, in input order. A task whose checkbox this call changed SHALL report `flipped`; a task that was already complete SHALL report `already-done`.

#### Scenario: Several finished tasks are marked together

- **WHEN** the tool receives three pending task ids
- **THEN** all three checkboxes become checked in one call
- **AND** `results` lists the three ids with status `flipped` in input order
- **AND** `next` names the first remaining pending task

#### Scenario: A mixed batch keeps a status per task

- **WHEN** one id is already complete and one id is pending
- **THEN** `results` reports `already-done` for the completed id and `flipped` for the pending one

#### Scenario: A duplicate id is reported once

- **WHEN** the same id appears twice in `taskIds`
- **THEN** the checkbox flips once and `results` carries one entry for that task

#### Scenario: A single task is a one-element batch

- **WHEN** `taskIds` contains one id
- **THEN** the call returns one result entry and the same progress, state and next fields as a batch

### Requirement: Batch marking changes nothing unless every id resolves

`openspec_mark_task_done` SHALL resolve every id against the cached apply state and its tracking file before writing. When any id does not resolve to a task, the call SHALL fail with the missing ids and SHALL leave every checkbox unchanged.

#### Scenario: Unknown id in a batch

- **WHEN** `taskIds` includes an id that no tracking file contains
- **THEN** the call fails and names the missing ids
- **AND** no checkbox changes, including those whose ids were valid

#### Scenario: Tracking file changed outside the tool

- **WHEN** an id no longer resolves at its cached location because the tracking file changed
- **THEN** the tool refreshes the apply state once before deciding that the id is missing

#### Scenario: A corrected batch is marked in full

- **WHEN** the agent resends the batch with the missing id corrected
- **THEN** every id resolves and the whole batch is marked

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
