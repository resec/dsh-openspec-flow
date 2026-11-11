# skill-adaptation Specification Delta

## MODIFIED Requirements

### Requirement: Instructions output maps CLI commands to tools

The `instructions` action of `openspec_inspect` SHALL replace known CLI command fragments in the instruction text with `openspec_inspect` calls that name the matching action.

#### Scenario: Proposal instruction is read

- **WHEN** the `instructions` action returns the proposal instruction on the bundled OpenSpec CLI
- **THEN** the text names `openspec_inspect` with the `list`, `show` and `validate` actions instead of `openspec list --specs`, `openspec show` and `openspec validate`

### Requirement: Workflow skills consume returned project configuration

The shipped workflow skills SHALL tell the agent to use the project `context`, per-artifact `rules` and operation `guidance` returned by the tools. The archive skill SHALL read the archive inputs with the `instructions` action before calling `openspec_archive`.

#### Scenario: Propose and update use artifact context and rules

- **WHEN** the propose or update skill writes or revises an artifact
- **THEN** it tells the agent to follow the `context` and `rules` returned by the `instructions` action for that artifact

#### Scenario: Apply uses apply context and guidance

- **WHEN** the apply skill reads the result of `openspec_apply_next`
- **THEN** it tells the agent to follow `context` and `guidance` when those fields are present

#### Scenario: Archive reads archive inputs first

- **WHEN** the archive skill starts for a change
- **THEN** it calls `openspec_inspect` with `action: "instructions"` and `artifact: "archive"` before `openspec_archive`
- **AND** it tells the agent to follow the returned `context` and `guidance` when present
- **AND** it proceeds when both fields are absent

### Requirement: Propose skill reads existing specs before proposing scope

The `openspec-propose` skill SHALL instruct the agent to inventory capabilities with `openspec_inspect` (`action: "list"`, `specs: true`), take a filtered overview with `openspec_inspect` (`action: "show"`, `type: "spec"`, `noScenarios: true`), and read each relevant capability in full with `openspec_inspect` (`action: "show"`, `type: "spec"`) before stating the change scope. It SHALL require the agent to surface a conflict with an existing requirement and ask instead of deciding it silently.

#### Scenario: Proposal scope is prepared

- **WHEN** the propose skill is loaded for a new change
- **THEN** it tells the agent to list capabilities, read each relevant spec in full, and name the capability and requirement behind each conclusion
- **AND** it tells the agent to surface a conflict with an existing requirement and ask

### Requirement: Explore skill reads relevant specs in full

The `openspec-explore` skill SHALL state that a filtered `show` action read is only an overview and SHALL require a full read of every relevant spec, including scenarios, before the agent says what a capability covers or what should change. It SHALL keep the read bounded to what the question needs.

#### Scenario: Capability coverage is assessed

- **WHEN** the explore skill is used to assess what the project already covers
- **THEN** it tells the agent to start with the filtered read and then read every relevant spec in full, including scenarios

### Requirement: Skills route gated tools through the admin command

A packaged skill that needs a management tool SHALL tell the agent to ask the user to run `/opsx-admin` and to continue after the tool appears. It SHALL NOT treat a gated tool as a missing plugin tool.

#### Scenario: Exploration needs the schema list

- **WHEN** the user asks which workflow the project follows and `openspec_schemas` is not exposed
- **THEN** the explore skill directs the agent to ask for `/opsx-admin` and to answer from the tool result after it appears

#### Scenario: Proposing finds a project that is not set up

- **WHEN** the `list` action returns `setup: false` and `openspec_init` is not exposed
- **THEN** the propose skill directs the agent to offer `/opsx-admin init`, a store target, or skipping OpenSpec

#### Scenario: The block is already open

- **WHEN** the management tool is exposed
- **THEN** the skill calls it directly without asking for the command
