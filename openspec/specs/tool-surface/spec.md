# tool-surface Specification

## Purpose
Defines the agent-facing OpenSpec tool surface: which workflow steps are tools, what each tool returns, how writes are guarded, and how schema and store rules apply. The goal is that an agent never needs to run the OpenSpec CLI directly.

## Requirements

### Requirement: Workflow steps are exposed as tools

The plugin SHALL expose the core change-flow tools — inspect, apply, task marking, new change and archive — to every changer agent; the independent reviewer SHALL receive none of them. `openspec_inspect` SHALL carry the list, status, instructions, show, context and validate steps through its `action` parameter. The plugin SHALL expose the management tools — schemas, store list and init — only while the management block is open. Every exposed step SHALL be performed through an `openspec_*` tool.

#### Scenario: Agent runs a complete workflow

- **WHEN** a changer agent proposes, applies and archives a change in an OpenSpec project
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

#### Scenario: Reviewer catalog excludes the core change-flow tools

- **WHEN** the reviewer's model-facing catalog is read
- **THEN** it contains none of `openspec_inspect`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_new_change` or `openspec_archive`

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

### Requirement: Write tools check preconditions

`openspec_new_change`, `openspec_archive` and `openspec_init` SHALL reject implicit root creation, missing names and unwritable targets before writing.

#### Scenario: Archive without a valid change

- **WHEN** `openspec_archive` is called with a change that fails validation
- **THEN** the tool returns the validation findings and does not move or rewrite files

#### Scenario: Init on a read-only project

- **WHEN** `openspec_init` cannot write the project
- **THEN** it returns an actionable error and leaves the project unchanged

### Requirement: Change-scoped tools enforce the schema gate

The `status`, `instructions` and `validate` actions of `openspec_inspect`, and `openspec_apply_next`, SHALL reject a schema other than the bundled `spec-driven` copy.

#### Scenario: Custom schema is selected

- **WHEN** a change selects a schema the plugin does not support
- **THEN** the status, instructions and validate actions, and `openspec_apply_next`, return the unsupported-schema error instead of running the read

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

- **WHEN** the status or instructions action of `openspec_inspect`, `openspec_new_change` or `openspec_archive` returns a change path
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

### Requirement: No sync-only write tool

The plugin SHALL NOT expose a tool that applies a change's delta specs to main specs without archiving the change.

#### Scenario: A sync-only write is requested
- **WHEN** the user asks for a tool that merges delta specs without archiving
- **THEN** no such tool exists, and the flow rule states that the flow is unsupported

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

### Requirement: Shared parameter descriptions stay uniform and short

A parameter accepted by multiple tools SHALL use one identical description on every tool. The description SHALL state only what the value is, in at most one short sentence; when and how to pass the value belongs in the shipped skill, not in the JSON Schema. The `store` parameter SHALL be described as `Registered store id.` on every tool that accepts it.

#### Scenario: Store description is uniform

- **WHEN** the tool surface is inspected
- **THEN** every tool exposing `store` describes it as `Registered store id.`
- **AND** no tool repeats store usage guidance in its schema

#### Scenario: A shared description diverges

- **WHEN** a contributor changes one tool's `store` description
- **THEN** `node --test test/` fails and names the mismatching tool

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

### Requirement: Management tools are gated by a user command

The plugin SHALL keep `openspec_init`, `openspec_store_list` and `openspec_schemas` out of the model-facing catalog until the user runs `/opsx-admin`. `/opsx-admin` SHALL open the block for the current turn, and `/opsx-admin off` SHALL close it early. No model-facing tool SHALL open the block.

#### Scenario: A session starts with the block closed

- **WHEN** an agent is created in an OpenSpec project
- **THEN** the management block is closed and none of the three management tools is advertised

#### Scenario: The user opens the block with an intent

- **WHEN** the user runs `/opsx-admin init this project`
- **THEN** the block opens and the intent is submitted as the request that the agent answers with the management tools available

#### Scenario: The model tries to use a gated tool

- **WHEN** the model requests `openspec_store_list` while the block is closed
- **THEN** the call fails as an unknown tool and the model has no tool or command that opens the block

#### Scenario: The user closes the block early

- **WHEN** the user runs `/opsx-admin off` while the block is open
- **THEN** the three management tools leave the catalog from the next step and stay out

### Requirement: The management block ends with the turn

The block SHALL close when the agent returns to idle after the turn it was opened for. It SHALL NOT be persisted, and a resumed or forked session SHALL start with the block closed.

#### Scenario: The answered turn ends

- **WHEN** the turn that used the open block settles and the agent becomes idle
- **THEN** the block is closed before the next turn starts

#### Scenario: A session resumes

- **WHEN** a session that used `/opsx-admin` is resumed in a new process
- **THEN** the block is closed and no management tool is advertised until the user runs the command again

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

### Requirement: Draft review is exposed as one tool

The plugin SHALL expose `openspec_review` for the draft review. Its `action` parameter SHALL select `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` or `abandon`. The tool SHALL return the review id, the current round, the artifact hash, the status and the next action. It SHALL NOT expose reviewer-subagent actions until the independent reviewer is added.

#### Scenario: Draft review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** the result names the review id, round, artifact hash and a brief
- **AND** the brief lists the draft review axes and the artifact paths

#### Scenario: Draft review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "draft"` for a recorded review
- **THEN** the result names the current round, artifact hash and the round brief

#### Scenario: Review status is read

- **WHEN** an agent calls `openspec_review` with `action: "status"`
- **THEN** the result reports the state, whether the review is ready, the blockers and the next action

#### Scenario: Self-review report is submitted

- **WHEN** an agent calls `self-report` with a valid report for a `reviewers: 0` review
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Unknown action is refused

- **WHEN** `openspec_review` receives an action outside the supported set
- **THEN** the parameter schema rejects the call before execution

### Requirement: Draft review tool is absent when disabled

The plugin SHALL register `openspec_review` only while the draft review is enabled. When the draft review is disabled, an agent's tool catalog SHALL contain no `openspec_review` entry.

#### Scenario: Draft review is disabled

- **WHEN** the plugin loads with `reviews.draft.enabled` false
- **THEN** the tool catalog contains no `openspec_review`

#### Scenario: Draft review is enabled

- **WHEN** the plugin loads with `reviews.draft.enabled` true
- **THEN** the tool catalog contains `openspec_review`

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review and the apply locks before reading or advancing the apply state. An unready review fails the call and names `openspec_review`; a lock naming another identity fails it and names the holder and lock paths, regardless of git, store, draft switch or policy. The first apply after a ready review in a git project requires the seal commit and records it as the base; a later draft artifact mismatch no longer refuses.

#### Scenario: Review is not ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is not ready
- **THEN** the call fails, the apply state is unchanged and the error names `openspec_review`

#### Scenario: Review is ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is ready
- **THEN** the call proceeds and returns the apply projection

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the apply lock

#### Scenario: Change has no policy

- **WHEN** a legacy change has no review policy
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the apply lock

#### Scenario: Ready review passes apply

- **WHEN** the change has a ready draft review and a sealed draft commit
- **THEN** `openspec_apply_next` proceeds and records the seal commit as the apply base

#### Scenario: Dirty tree is refused before the seal

- **WHEN** the change directory or a file outside `openspec/changes/` has uncommitted changes before the first apply
- **THEN** the tool fails without changing the apply state and asks for a commit

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain before the first apply
- **THEN** the tool proceeds

#### Scenario: Mixed seal commit is refused

- **WHEN** `HEAD` changes files outside the change directory, `openspec/.gitignore` and `openspec/changes/` before the first apply
- **THEN** the tool fails and asks for a commit containing only OpenSpec change paths

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** apply already started and the draft artifact hash no longer matches
- **THEN** the tool does not refuse the call on that mismatch

#### Scenario: Another identity holds the apply lock

- **WHEN** a change whose draft review is ready calls `openspec_apply_next` while a lock names a different identity
- **THEN** the call fails, the apply state is unchanged and the error names the holder

#### Scenario: A store change from another project is refused

- **WHEN** a store change is applied from a second project while the store lock records the first project
- **THEN** the call fails because the implementation roots differ

#### Scenario: A non-git project enforces the lock

- **WHEN** a second change calls `openspec_apply_next` in a project without git while the lock names the first change
- **THEN** the call fails and names the holder

#### Scenario: The same implementation root re-enters apply

- **WHEN** `openspec_apply_next` runs again from the same implementation root for the change named by an apply lock
- **THEN** the call proceeds

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept `review: "apply"` for `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the commit, tree, base tree and readiness. The tool SHALL refuse an apply `start` outside a git repository; `status` is governed by the status requirement below. With `action: "waive"` and `scope: "plan-change"`, the tool SHALL accept `waiver` and `files` and record the plan-change waiver in the review directory.

#### Scenario: Apply review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "apply"` on a clean commit
- **THEN** the result names the review id, round, commit, tree and base tree

#### Scenario: Apply review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "apply"` for a recorded review
- **THEN** the result names the round, commit, tree and base tree

#### Scenario: Apply review is unavailable

- **WHEN** an agent requests an apply review `start` without git
- **THEN** the call fails with an actionable error

#### Scenario: Apply report is submitted

- **WHEN** an agent submits a valid apply report
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Plan-change waiver is recorded

- **WHEN** apply started and `waive` is called with `scope: "plan-change"`, a non-empty `waiver`, `approvedBy: "user"` and `files`
- **THEN** the review directory carries the waiver and the result reports it

#### Scenario: Plan-change waiver before apply started is refused

- **WHEN** `waive` with `scope: "plan-change"` runs before apply started
- **THEN** the call fails and names the draft review

### Requirement: Archive waits for a ready apply review

`openspec_archive` SHALL check the apply locks and the apply review before reading the change list or running validation. A lock naming another identity fails the call and moves nothing. An enabled unready apply review returns no archive result and moves nothing; a disabled review or a project without git skips that check. With no lock it proceeds without writing one, and after a successful archive it releases the locks naming the archived change.

#### Scenario: Apply review is not ready

- **WHEN** `openspec_archive` runs for a change whose apply review is not ready
- **THEN** the call fails, no file moves and the error names `openspec_review`

#### Scenario: Apply review is ready

- **WHEN** the apply review is ready and the tree matches
- **THEN** `openspec_archive` may proceed

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** `openspec_archive` proceeds without an apply check

#### Scenario: Another identity holds the apply lock

- **WHEN** `openspec_archive` runs for a change whose identity differs from a present lock's identity
- **THEN** the call fails and no file moves

#### Scenario: A store change from another project does not archive

- **WHEN** a store change is archived from a project other than the store lock's implementation root
- **THEN** the call fails and no file moves

#### Scenario: No lock naming another identity is required to archive

- **WHEN** no apply lock names another identity for a ready change
- **THEN** `openspec_archive` proceeds and writes no lock

#### Scenario: Archive releases its locks

- **WHEN** `openspec_archive` archives the change named by the present locks
- **THEN** every lock that names the change is removed after the archive succeeds

#### Scenario: Another change's uncommitted artifacts do not block archive

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain
- **THEN** archive proceeds

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

The `openspec-reviewer` preset SHALL compose `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`; `read_image` SHALL register only while the Host provides the `attachments` service. The reviewer entry SHALL deny every other global Host tool by name and keep the preset's registered tools visible. It SHALL NOT compose `bash`, `write`, `edit`, `subagent`, `workflow` or `openspec_review`. Activation SHALL fail when the initial deny set cannot be applied.

#### Scenario: Reviewer inspects its catalog

- **WHEN** the reviewer's model-facing catalog is read on a Host that provides the `attachments` service
- **THEN** it contains only `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`

#### Scenario: Reviewer calls an inherited Host tool

- **WHEN** the reviewer calls `openspec_review`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_new_change`, `openspec_inspect`, an `issues_*` tool or `create_worktree`
- **THEN** the call fails as an unknown tool and no handler runs

#### Scenario: Reviewer attempts to use an editing tool

- **WHEN** the reviewer attempts to call an editing, shell or delegation tool
- **THEN** the call fails as an unknown tool

#### Scenario: Host tool registered after activation

- **WHEN** a Host tool is registered after the reviewer entry has applied its deny set and the refresh writes its restriction
- **THEN** the refreshed reviewer catalog does not contain that tool and a call fails as an unknown tool

#### Scenario: Refresh restriction cannot be written

- **WHEN** the refresh cannot write its restriction for a newly registered Host tool
- **THEN** the entry logs a warning, the earlier deny set stays in force, and the next successful refresh denies the tool

#### Scenario: Reviewer reads a spec

- **WHEN** the reviewer needs a main spec
- **THEN** the read and search tools are available

#### Scenario: Reviewer searches an external fact

- **WHEN** the brief names a fact without a URL and the provider selected for search is ready for the step's route
- **THEN** `web_search` is in the reviewer's tool surface

#### Scenario: Reviewer fetches a cited page

- **WHEN** the brief cites a page and the provider selected for fetch is ready for the step's route
- **THEN** `web_fetch` is in the reviewer's tool surface

#### Scenario: One selected provider is not ready

- **WHEN** the provider selected for one web operation cannot authenticate for the step's route
- **THEN** that tool is withheld, the other web tool remains available when its own provider is ready, and the preset stays active

#### Scenario: Restriction cannot be applied

- **WHEN** the reviewer entry cannot apply the initial deny set
- **THEN** the preset activation fails and no reviewer session starts

### Requirement: The reviewer preset activates on the pinned runtime

The `openspec-reviewer` preset SHALL activate on the DSH runtime pinned by the plugin's `engines.dsh`, with the read-only file, search and web tools it declares. Each child tool's configuration SHALL satisfy that runtime's required fields, so an independent reviewer can start. The preset SHALL require the Host `web` service; a Host without it does not compose a reviewer session.

#### Scenario: Independent reviewer starts

- **WHEN** a change's policy sets `reviewers: 1`, the plugin runs on the pinned DSH runtime, and the Host provides the `web` service
- **THEN** the reviewer preset activates and the reviewer session starts

#### Scenario: A required tool setting is missing

- **WHEN** a preset child tool omits a field its pinned runtime requires
- **THEN** preset activation fails before the reviewer session starts

#### Scenario: The Host has no web service

- **WHEN** the Host provides no `web` service
- **THEN** the preset does not compose a reviewer session and its diagnostic stays on the preset roster

### Requirement: Apply review status reports policy, enabled and available

`openspec_review` with `action: "status"` and `review: "apply"` SHALL report `policy`, `enabled` and `available`. `policy` SHALL be true when the locked policy carries an apply section; `enabled` SHALL reflect that section; `available` SHALL be false without a git repository. For an unavailable, unset or disabled review it SHALL return `ready: false` and the next action instead of failing.

#### Scenario: Status outside git with a new policy

- **WHEN** an agent calls apply status in a project without git whose policy was created by this plugin
- **THEN** the result has `policy: true`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status outside git with a legacy enabled policy

- **WHEN** a policy written before this change enables apply review in a project without git
- **THEN** the result has `policy: true`, `enabled: true` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status with a disabled policy

- **WHEN** a git project's change policy disables apply review
- **THEN** the result has `policy: true`, `enabled: false` and `available: true`
- **AND** it does not ask the agent to start the review and names `openspec_archive` as the next action

#### Scenario: Status with an enabled policy

- **WHEN** a git project's change policy enables apply review and the review has not started
- **THEN** the result has `policy: true`, `enabled: true` and `available: true`
- **AND** it names `openspec_review` with `action: "start"` as the next action

#### Scenario: Status with no policy

- **WHEN** a legacy change in a git project has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start locks a policy and `nextAction` is `openspec_review` with `action: "start"`

#### Scenario: Status with a draft-only policy

- **WHEN** a legacy policy carries only a draft section
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start migrates the apply section and `nextAction` is `openspec_review` with `action: "start"`

#### Scenario: Status outside git with no policy

- **WHEN** a legacy change in a project without git has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

### Requirement: The reviewer preset chooses no web provider

The `openspec-reviewer` preset SHALL mount the web tool plugin without mounting a web service instance or a web provider, and SHALL NOT carry a provider selection key. `web_search` and `web_fetch` SHALL resolve the providers the deployment's Host web service selects for search and for fetch respectively.

#### Scenario: The preset is inspected

- **WHEN** the reviewer preset's plugin list is inspected
- **THEN** it contains the web tool plugin and no web service or provider entry

#### Scenario: The deployment selects the provider

- **WHEN** the reviewer calls `web_search` or `web_fetch`
- **THEN** the call uses the provider the deployment selected for that operation, not a provider named by the preset

#### Scenario: The deployment mixes providers

- **WHEN** the Host selects one provider for search and another for fetch
- **THEN** each web tool uses its own selected provider

### Requirement: Review actions name the other round entry

`openspec_review` SHALL keep `start` and `resume` disjoint. A `start` whose review record exists SHALL fail and name `resume`. A `resume` whose review record is absent SHALL fail and name `start`. Both errors SHALL carry the action to call next.

#### Scenario: Start names resume

- **WHEN** `start` is called for a draft or apply review that already has a record
- **THEN** the error names `openspec_review` with `action: "resume"`

#### Scenario: Resume names start

- **WHEN** `resume` is called for a draft or apply review that has no record
- **THEN** the error names `openspec_review` with `action: "start"`

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start` or `resume` SHALL carry the review kind. It SHALL name `start` when the review has no record; `resume` when a record exists, no finding is open, and either the object differs or a finding is fixed; and `dispose` while any finding is open. Once apply started, a draft next action SHALL name the apply review status, not `resume review=draft`.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose draft review has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded, no finding is open, and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record, no finding is open, and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`

#### Scenario: An open finding names dispose

- **WHEN** a record exists, the object changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose`
- **AND** it does not name `resume`

#### Scenario: Draft status after apply started names the apply review

- **WHEN** `status` for a draft review runs after apply started and the artifacts changed
- **THEN** the next action names the apply review
- **AND** it does not name a draft resume

### Requirement: Reviewer image reads require deployment support

The reviewer's `read_image` SHALL be available only when the Host provides the `attachments` service; a call SHALL fail without changing the review when the step's route does not declare image input.

#### Scenario: Reviewer reads an image cited by the brief

- **WHEN** the brief cites an image path, the Host provides the `attachments` service, and the step's route declares image input
- **THEN** `read_image` is in the reviewer's tool surface and returns the image

#### Scenario: The Host has no attachments service

- **WHEN** the Host provides no `attachments` service
- **THEN** `read_image` is absent from the reviewer's tool surface, its other tools remain available, and the preset still activates

#### Scenario: The route cannot accept images

- **WHEN** the reviewer calls `read_image` on a step whose route does not declare image input
- **THEN** the call fails with an error, the review record is unchanged, and the reviewer keeps its other read tools

### Requirement: Review disposition accepts a batch

`openspec_review` SHALL expose a `dispositions` parameter for `action: "dispose"` and for `action: "waive"` without `scope: "plan-change"`: an array of objects that each name an `id` and that finding's disposition fields, with no other property. It SHALL keep the single `id` form and SHALL reject a call that supplies both. The result SHALL carry `dispositions`, one entry per disposed finding with its id and status.

#### Scenario: Batch parameter is exposed

- **WHEN** the tool schema is inspected
- **THEN** `dispositions` is an array of objects with `id` required

#### Scenario: Entry schema is closed

- **WHEN** the tool schema is inspected
- **THEN** each entry permits only `id`, `status`, `note`, `waiver` and `approvedBy`

#### Scenario: Plan-change waiver rejects a batch

- **WHEN** a caller supplies `scope: "plan-change"` with `dispositions`
- **THEN** the call fails before any write

#### Scenario: Single form remains

- **WHEN** a caller disposes one finding with the `id` form
- **THEN** the call succeeds and the result carries its `dispositions` entry

#### Scenario: Both forms are rejected

- **WHEN** a caller supplies `id` and `dispositions` together
- **THEN** the call fails before any write

#### Scenario: Result lists the batch

- **WHEN** a call disposes two findings
- **THEN** the result names both ids and their final statuses

### Requirement: A task's text is its whole first paragraph

`openspec_apply_next` SHALL project a task's text as the CLI pinned by `project-invariants` parses it, and `openspec_mark_task_done` SHALL resolve a task by that same text: the text after the checkbox plus every following line until a line that ends the paragraph, joined with a single space, with a trailing hard break removed. A continuation line MUST NOT count as a task.

#### Scenario: A wrapped task keeps one text

- **WHEN** a tracking file writes one task across several lines
- **THEN** the projected description and the parsed description join those lines with a single space
- **AND** the task count is unchanged

#### Scenario: A hard break is dropped

- **WHEN** a task's line ends with a trailing `\` and its text continues on the next line
- **THEN** the description joins the next line without the backslash

#### Scenario: A sibling checkbox ends the text

- **WHEN** a wrapped task is followed by another checkbox item
- **THEN** the task's text ends at that line
- **AND** the sibling counts as its own task

#### Scenario: Any other list item only ends the text

- **WHEN** a wrapped task is followed by a plain list item, a heading or a blank line
- **THEN** the task's text ends at that line
- **AND** that line is not a task

#### Scenario: An empty checkbox takes the continuation text

- **WHEN** the checkbox line carries no text and the next line does
- **THEN** the description is that next line's text
- **AND** the task is addressable like any other described task

#### Scenario: A wrapped task still resolves by its source line

- **WHEN** `openspec_apply_next` returns a wrapped task and `openspec_mark_task_done` looks it up by source path and line
- **THEN** the plugin's description matches the CLI's, so the task resolves at that line

### Requirement: The reviewer reads finding status

`openspec_reviewer` `read` with `target: "findings"` SHALL return each recorded finding's id, severity, status, title, first round, verification round and last verification, plus each round's verdict and whether a report exists. The read SHALL NOT change the review.

#### Scenario: Reviewer reads the finding state

- **WHEN** the reviewer calls `read` with `target: "findings"`
- **THEN** the tool returns every recorded finding's id, severity, status, title, first round, verification round and last verification
- **AND** it returns each round's verdict and whether a report exists

#### Scenario: The finding read does not write

- **WHEN** the reviewer reads `target: "findings"`
- **THEN** the review record's bytes are unchanged

### Requirement: The reviewer reads an earlier report

`openspec_reviewer` `read` with `target: "own-report"` SHALL read the latest round when `round` is absent and the named round when it is present. A round that is not recorded or has no report SHALL fail and name the round.

#### Scenario: Reviewer reads an earlier round report

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a `round` that has a report
- **THEN** the tool returns that round's report

#### Scenario: Reviewer asks for a round without a report

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a `round` that has no report
- **THEN** the call fails and names the round

#### Scenario: Reviewer asks for an unrecorded round

- **WHEN** the reviewer calls `read` with `target: "own-report"` and a round the record does not contain
- **THEN** the call fails and names the round
