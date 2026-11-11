# tool-surface Specification Delta

## ADDED Requirements

### Requirement: Read surface is a single inspect entry

The plugin SHALL expose exactly one read tool, `openspec_inspect`, in the core block. Its `action` parameter SHALL select one of `list`, `status`, `show`, `instructions`, `context` or `validate`. The plugin SHALL NOT register `openspec_list`, `openspec_status`, `openspec_show`, `openspec_instructions`, `openspec_context` or `openspec_validate` as separate tools.

#### Scenario: Six reads share one entry

- **WHEN** an agent reads changes, a change status, a change or spec, an artifact instruction, the working context or validation findings
- **THEN** every read is a call to `openspec_inspect` with the matching `action`

#### Scenario: Old read tool names are absent

- **WHEN** the model-facing catalog of an OpenSpec project is inspected
- **THEN** it contains `openspec_inspect` and no `openspec_list`, `openspec_status`, `openspec_show`, `openspec_instructions`, `openspec_context` or `openspec_validate` entry

#### Scenario: Management block is unchanged

- **WHEN** the management block is closed
- **THEN** `openspec_inspect` remains available and `openspec_init`, `openspec_store_list` and `openspec_schemas` remain absent

### Requirement: Inspect actions preserve their response bodies

Each `openspec_inspect` action SHALL return the same projection, with the same fields and values, as the former tool it replaces for the same input. The only permitted differences are tool references inside response bodies: `nextSteps[].tool` and `members[].fetch.tool` SHALL name `openspec_inspect`, and their `arguments` SHALL carry the action they require.

#### Scenario: List action matches the former list projection

- **WHEN** `openspec_inspect` runs `action: "list"` with an optional `specs` value
- **THEN** the result has the same `setup`, `root`, `changes`, `specs` and `issue` fields and values as the former list tool

#### Scenario: Status action matches the former status projection

- **WHEN** `openspec_inspect` runs `action: "status"` for a change
- **THEN** the result keeps `schema`, `artifacts`, `blockedBy`, `applyRequires`, `actionContext` and path fields unchanged
- **AND** only the tool names inside `nextSteps` change

#### Scenario: Show action matches the former show projection

- **WHEN** `openspec_inspect` runs `action: "show"` with `name`, `type` or `noScenarios`
- **THEN** the result keeps the former `kind`, `name`, `title`, `requirements`, `deltas` and `root` fields

#### Scenario: Instruction action matches the former instructions projection

- **WHEN** `openspec_inspect` runs `action: "instructions"` with `artifact`
- **THEN** the result keeps the former `instruction`, `outputPath`, `dependencies`, `unlocks`, `context`, `rules` and archive fields

#### Scenario: Context action matches the former context projection

- **WHEN** `openspec_inspect` runs `action: "context"`
- **THEN** the result keeps the former `setup`, `root`, `members` and `status` fields
- **AND** only the tool name inside `fetch` changes

#### Scenario: Validate action matches the former validate projection

- **WHEN** `openspec_inspect` runs `action: "validate"` with `scope` or `strict`
- **THEN** the result keeps the former `valid`, `issues`, `items`, `scope`, `change` and `root` fields

### Requirement: Inspect validates action and parameter combinations

`openspec_inspect` SHALL reject an action whose required parameter is missing and any parameter the selected action does not accept. The rejection SHALL happen before any read runs, and the error SHALL name the action and the offending parameter.

#### Scenario: Status without a change

- **WHEN** `openspec_inspect` runs `action: "status"` without `change`
- **THEN** the call fails naming `status` and `change`
- **AND** no read process starts

#### Scenario: Show without a name

- **WHEN** `openspec_inspect` runs `action: "show"` without `name`
- **THEN** the call fails naming `show` and `name`

#### Scenario: Instructions without an artifact

- **WHEN** `openspec_inspect` runs `action: "instructions"` without `artifact`
- **THEN** the call fails naming `instructions` and `artifact`

#### Scenario: A parameter belongs to another action

- **WHEN** `openspec_inspect` runs `action: "list"` with `artifact`
- **THEN** the call fails stating that `artifact` is only valid for `instructions`

#### Scenario: Unknown action is refused

- **WHEN** `openspec_inspect` receives an action outside the six values
- **THEN** the parameter schema rejects the call before execution

### Requirement: Inspect output schema has one branch per action

`openspec_inspect` SHALL declare an `output.schema` whose `oneOf` has exactly one branch per action. Every successful result SHALL match exactly one branch, and the test suite SHALL fail when a result matches zero or more than one branch.

#### Scenario: Each action matches one branch

- **WHEN** any of the six actions returns a successful projection
- **THEN** exactly one `oneOf` branch accepts that result

#### Scenario: An action loses its branch

- **WHEN** an action's projection changes shape without its branch changing
- **THEN** the output validation fails and names the action

## MODIFIED Requirements

### Requirement: Workflow steps are exposed as tools

The plugin SHALL expose the core change-flow tools — inspect, apply, task marking, new change and archive — to every agent. `openspec_inspect` SHALL carry the list, status, instructions, show, context and validate steps through its `action` parameter. The plugin SHALL expose the management tools — schemas, store list and init — only while the management block is open. Every exposed step SHALL be performed through an `openspec_*` tool.

#### Scenario: Agent runs a complete workflow

- **WHEN** an agent proposes, applies and archives a change in an OpenSpec project
- **THEN** every step is performed through an `openspec_*` tool and no `openspec` command is executed by the agent

#### Scenario: Out-of-scope command is requested

- **WHEN** the agent needs a command outside the tool surface, such as `config` or `workset`
- **THEN** the tool surface does not pretend to support it and the skill directs the agent to report the limitation

#### Scenario: Management tools are absent while the block is closed

- **WHEN** an agent's session has not opened the management block
- **THEN** its tool catalog contains no `openspec_init`, `openspec_store_list` or `openspec_schemas`, and a call to one of them fails as an unknown tool

#### Scenario: Management work runs after the block opens

- **WHEN** the user opens the management block and asks to initialize a project, list stores or list schemas
- **THEN** the agent calls the matching management tool in that turn

### Requirement: Tool results are projections

`openspec_inspect` SHALL return a compact projection of the read it performs instead of the full payload, preserving the fields the next step needs. Project-internal paths SHALL follow the relative-path requirement above. The status action SHALL name the artifacts that block planning and SHALL express the next step as tool calls rather than command text.

#### Scenario: Status is read

- **WHEN** `openspec_inspect` runs `action: "status"` for a change
- **THEN** the result contains schema, artifact completion, `blockedBy` when planning is incomplete, `nextSteps` as tool actions, and edit constraints
- **AND** `changeRoot`, `planningHome` and `allowedEditRoots` are relative to the returned `root.path`

#### Scenario: Planning is incomplete

- **WHEN** one or more artifacts have status `ready` and `isPlanningComplete` is false
- **THEN** `blockedBy` lists those artifact ids in build order
- **AND** `nextSteps` contains an `openspec_inspect` action with `action: "instructions"` for the first ready artifact

#### Scenario: Planning is complete

- **WHEN** `isPlanningComplete` is true
- **THEN** `blockedBy` is absent
- **AND** `nextSteps` contains an `openspec_apply_next` action for the change

#### Scenario: Status is read with a store

- **WHEN** `openspec_inspect` runs `action: "status"` with a store id
- **THEN** every `nextSteps` action carries that store id in its arguments

#### Scenario: Status carries no command text

- **WHEN** `openspec_inspect` runs `action: "status"` and returns a next step
- **THEN** no entry contains a shell command for an OpenSpec operation

#### Scenario: Instructions are read

- **WHEN** `openspec_inspect` runs `action: "instructions"` for an artifact
- **THEN** the result keeps the instruction text, output path, existing outputs and prerequisites, with `resolvedOutputPath` and `existingOutputPaths` relative to `root.path`, and drops unrelated planning-home internals

### Requirement: Change-scoped tools enforce the schema gate

The `status`, `instructions` and `validate` actions of `openspec_inspect`, and `openspec_apply_next`, SHALL reject a schema other than the bundled `spec-driven` copy.

#### Scenario: Custom schema is selected

- **WHEN** a change selects a schema the plugin does not support
- **THEN** the status, instructions and validate actions, and `openspec_apply_next`, return the unsupported-schema error instead of running the read

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

- **WHEN** the status or instructions action of `openspec_inspect`, `openspec_new_change` or `openspec_archive` returns a change path
- **THEN** paths such as `changeRoot`, `resolvedOutputPath`, `existingOutputPaths`, `change.path`, `change.metadataPath` and `path` are relative to `root.path`

#### Scenario: Mark accepts the relative source path

- **WHEN** `openspec_mark_task_done` receives the relative `sourcePath` returned by `openspec_apply_next`
- **THEN** it resolves that path against the cached project root and verifies the same task

### Requirement: Delta section parsing reports the bundled CLI result

The `validate` and `show` actions of `openspec_inspect`, and `openspec_archive`, SHALL return the bundled OpenSpec CLI's parse of delta spec sections without reinterpreting section headings or silently dropping misplaced requirements.

#### Scenario: Closed section heading is read

- **WHEN** a delta spec writes a section heading with a trailing `#` run, such as `## ADDED Requirements ##`
- **THEN** the `show` action lists the requirement as a delta
- **AND** the `validate` action reports the change valid

#### Scenario: Unrecognized requirement section fails validation

- **WHEN** a delta spec places a requirement under an unrecognized section such as `## DEPRECATED Requirements`
- **THEN** the `validate` action reports `valid: false` with an error naming the requirement
- **AND** `openspec_archive` returns `valid: false`, `archived: false` and the same issues without moving or rewriting files

### Requirement: Context projection preserves store identity and diagnostics

The `context` action of `openspec_inspect` SHALL keep the resolved root's store id, project every diagnostic with its recovery action, and express an available referenced store's fetch recipe as a tool action instead of command text.

#### Scenario: Root resolves from a store

- **WHEN** the `context` action resolves a root selected from a registered store
- **THEN** `root.store_id` is that store id
- **AND** `root.path` and `root.source` are unchanged

#### Scenario: Diagnostic carries a recovery action

- **WHEN** the CLI reports a top-level or member diagnostic with a code and a fix
- **THEN** the projected diagnostic keeps `severity`, `code`, `message` and `fix`

#### Scenario: Referenced store is available

- **WHEN** a referenced store has a path and no diagnostics
- **THEN** its `fetch` field names `openspec_inspect`, sets `action` to `show`, sets `type` to `spec`, and sets `store` to the member id
- **AND** the fetch field states that `name` is a spec id from that store
- **AND** the result contains no shell command

#### Scenario: Referenced store is unavailable

- **WHEN** a referenced store has no path
- **THEN** the member has no `fetch` field
- **AND** its `status` keeps the diagnostic code and fix

#### Scenario: Context call has no referenced stores

- **WHEN** a project declares no store references
- **THEN** `members` is an empty array
- **AND** `status` is an empty array when the root resolves without diagnostics

### Requirement: Instructions carry project configuration

The `instructions` action of `openspec_inspect` SHALL return the project `context` and the requested artifact's `rules` from `openspec/config.yaml` when they are configured, and SHALL omit each field when it is empty. With `artifact: "archive"`, the action SHALL return the archive operation inputs instead of artifact fields: `change`, `artifact: "archive"`, `context` when configured, `guidance` when configured, and `root` when reported.

#### Scenario: Artifact instruction includes project context and rules

- **WHEN** the `instructions` action reads `proposal` for a project whose `openspec/config.yaml` sets `context` and `rules.proposal`
- **THEN** the result contains `context` with the configured text
- **AND** the result contains `rules` with the configured proposal rules in order
- **AND** the artifact fields `instruction`, `outputPath`, `dependencies` and `unlocks` remain present

#### Scenario: Artifact instruction without project configuration

- **WHEN** the `instructions` action reads an artifact for a project without `context` or matching `rules`
- **THEN** the result omits `context` and `rules`
- **AND** the artifact fields are unchanged

#### Scenario: Archive instruction returns operation inputs

- **WHEN** the `instructions` action reads `archive` for a project whose `openspec/config.yaml` sets `context` and `operations.archive.guidance`
- **THEN** the result contains `change`, `artifact: "archive"`, `context` and `guidance`
- **AND** the result does not contain `schema`, `outputPath`, `instruction`, `dependencies` or `unlocks`

#### Scenario: Archive instruction without project configuration

- **WHEN** the `instructions` action reads `archive` for a project without `context` or archive guidance
- **THEN** the result contains `change`, `artifact: "archive"` and `root`
- **AND** the result omits `context` and `guidance`

### Requirement: Instruction text names tool parameters

The `instructions` action of `openspec_inspect` SHALL rewrite CLI flags in the built-in schema instruction into the corresponding tool parameter syntax, so the returned `instruction` contains no `--store`, `--type` or `--specs` flag. The rewrite SHALL apply only to `instruction`; configured `context` and `rules` SHALL be returned unchanged.

#### Scenario: Store flag in prose

- **WHEN** the instruction returns text containing "Append `--store \"<id>\"`"
- **THEN** the text contains `store: "<id>"` instead
- **AND** it contains no `--store`

#### Scenario: Type flag split across lines

- **WHEN** the instruction wraps "`--type`" and "spec`" across two lines
- **THEN** the text contains `type: "spec"` instead
- **AND** it contains no `--type`

#### Scenario: Specs flag in prose

- **WHEN** the instruction returns text containing "without `--specs`"
- **THEN** the text contains `specs: true` instead
- **AND** it contains no `--specs`

#### Scenario: Bare store flag

- **WHEN** the instruction returns text containing "came from `--store`"
- **THEN** the text contains "came from `store`" instead
- **AND** it contains no `--store`

#### Scenario: Configured project text is not rewritten

- **WHEN** the project sets `context` or `rules` containing `--store`
- **THEN** those fields are returned verbatim
- **AND** only `instruction` is rewritten

### Requirement: Instruction references are artifact ids

The `instructions` action of `openspec_inspect` SHALL return `dependencies` and `unlocks` as arrays of artifact ids. A dependency descriptor SHALL be reduced to its `id`; a string entry SHALL be preserved; an entry without an id SHALL be omitted. No entry SHALL be a serialized object such as "[object Object]".

#### Scenario: Dependencies are descriptors

- **WHEN** the CLI returns dependencies `[{id: "proposal", done: true, path: "proposal.md"}]`
- **THEN** `dependencies` is `["proposal"]`
- **AND** no entry contains "[object Object]"

#### Scenario: String unlock is preserved

- **WHEN** the CLI returns unlocks `["tasks"]`
- **THEN** `unlocks` is `["tasks"]`

#### Scenario: Entry without an id is omitted

- **WHEN** a dependency entry is an object without `id`, `artifactId` or `name`
- **THEN** the entry is omitted from `dependencies`
