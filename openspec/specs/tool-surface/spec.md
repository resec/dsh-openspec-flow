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

Each read tool SHALL return a compact projection of the CLI JSON instead of the full payload, preserving the fields the next step needs.

#### Scenario: Status is read

- **WHEN** `openspec_status` reads a change
- **THEN** the result contains schema, artifact completion, next step and edit constraints without the CLI's absolute path map

#### Scenario: Instructions are read

- **WHEN** `openspec_instructions` reads an artifact
- **THEN** the result keeps the instruction text, output path, existing outputs and prerequisites, and drops unrelated planning-home internals

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
