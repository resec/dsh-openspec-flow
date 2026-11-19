# Spec Delta

## MODIFIED Requirements

### Requirement: Read surface is a single inspect entry

The plugin SHALL expose exactly one read tool, `openspec_inspect`, in the core block. Its `action` parameter SHALL select one of `list`, `status`, `show`, `instructions`, `context`, `validate` or `worktree`. The plugin SHALL NOT register `openspec_list`, `openspec_status`, `openspec_show`, `openspec_instructions`, `openspec_context`, `openspec_validate` or a separate worktree status tool.

#### Scenario: Six reads share one entry

- **WHEN** an agent reads changes, a change status, a change or spec, an artifact instruction, the working context or validation findings
- **THEN** every read is a call to `openspec_inspect` with the matching `action`

#### Scenario: Old read tool names are absent

- **WHEN** the model-facing catalog of an OpenSpec project is inspected
- **THEN** it contains `openspec_inspect` and no `openspec_list`, `openspec_status`, `openspec_show`, `openspec_instructions`, `openspec_context`, `openspec_validate` or worktree status entry

#### Scenario: Management block is unchanged

- **WHEN** the management block is closed
- **THEN** `openspec_inspect` remains available and `openspec_init`, `openspec_store_list` and `openspec_schemas` remain absent

### Requirement: Inspect validates action and parameter combinations

`openspec_inspect` SHALL reject an action whose required parameter is missing and any parameter the selected action does not accept. The rejection SHALL happen before any read runs, and the error SHALL name the action and the offending parameter. The `worktree` action SHALL require `change` and accept an optional `store`.

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

- **WHEN** `openspec_inspect` receives an action outside the seven values
- **THEN** the parameter schema rejects the call before execution

#### Scenario: Worktree without a change

- **WHEN** `openspec_inspect` runs `action: "worktree"` without `change`
- **THEN** the call fails naming `worktree` and `change`
- **AND** no read process starts

### Requirement: Inspect output schema has one branch per action

`openspec_inspect` SHALL declare an `output.schema` whose `oneOf` has exactly one branch per action. Every successful result SHALL match exactly one branch, and the test suite SHALL fail when a result matches zero or more than one branch.

#### Scenario: Each action matches one branch

- **WHEN** any of the seven actions returns a successful projection
- **THEN** exactly one `oneOf` branch accepts that result

#### Scenario: An action loses its branch

- **WHEN** an action's projection changes shape without its branch changing
- **THEN** the output validation fails and names the action


### Requirement: Inspect actions preserve their response bodies

Each `openspec_inspect` action except `worktree` SHALL return the same projection, with the same fields and values, as the former tool it replaces. The only permitted differences are tool references inside response bodies: `nextSteps[].tool` and `members[].fetch.tool` SHALL name `openspec_inspect`, and their `arguments` SHALL carry the action they require.

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

#### Scenario: Worktree action is not a replacement

- **WHEN** `openspec_inspect` runs `action: "worktree"`
- **THEN** the result is the new state, lock and doctor projection, not a former tool projection

## ADDED Requirements

### Requirement: Apply worktree recovery is exposed as one tool

The plugin SHALL expose `openspec_apply_worktree` with the `recover` action. The call SHALL accept `change`, an optional `store`, a `scope` of `lifecycle` or `change`, and an `expectedOwner` token. `change` SHALL be required for the change scope. An unknown action, an invalid scope or a missing token SHALL be refused. The reviewer preset SHALL deny the tool.

#### Scenario: Recovery reports the recovered scope

- **WHEN** recovery removes a dead change lock with the matching token
- **THEN** the result carries `recovered: true` and `scope: "change"`

#### Scenario: Recovery requires its owner token

- **WHEN** a caller omits `expectedOwner`
- **THEN** the tool refuses the call before reading or removing a lock

#### Scenario: An invalid scope is refused

- **WHEN** a caller passes a scope outside `lifecycle` and `change`
- **THEN** the tool refuses the call before reading or removing a lock

#### Scenario: An unknown action is refused

- **WHEN** a caller passes an action outside `recover`
- **THEN** the tool refuses the call and names `recover`

#### Scenario: The reviewer cannot use the tool

- **WHEN** the independent reviewer's tool catalog is assembled
- **THEN** `openspec_apply_worktree` is absent
