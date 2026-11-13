# skill-adaptation Specification

## Purpose
Defines how the plugin initializes an OpenSpec project and keeps its shipped instruction text aligned with the tool surface.

## Requirements

### Requirement: Instructions output maps CLI commands to tools

The `instructions` action of `openspec_inspect` SHALL replace known CLI command fragments in the instruction text with `openspec_inspect` calls that name the matching action.

#### Scenario: Proposal instruction is read

- **WHEN** the `instructions` action returns the proposal instruction on the bundled OpenSpec CLI
- **THEN** the text names `openspec_inspect` with the `list`, `show` and `validate` actions instead of `openspec list --specs`, `openspec show` and `openspec validate`

### Requirement: Init creates the OpenSpec project structure

`openspec_init` SHALL create `openspec/config.yaml` and the OpenSpec directory structure through the bundled CLI's `init --tools none`, and SHALL NOT generate official skills or AI-tool configuration.

#### Scenario: Empty project is initialized

- **WHEN** `openspec_init` runs in a directory without `openspec/config.yaml` or `openspec/config.yml`
- **THEN** the project has `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/` and `openspec/changes/archive/`, and no `AGENTS.md` or skill file is generated

#### Scenario: Existing config is preserved

- **WHEN** `openspec_init` runs in a project that already has `openspec/config.yaml`
- **THEN** the CLI is not run, the config file is not rewritten, and the result reports `config: "exists"`

#### Scenario: Target is not writable

- **WHEN** the target directory cannot be written
- **THEN** the tool returns an actionable error and leaves the project unchanged

### Requirement: Init returns the project root and config state

`openspec_init` SHALL return the resolved project root and whether this call created the configuration.

#### Scenario: Init result is read

- **WHEN** `openspec_init` completes
- **THEN** the result contains `root` and `config`, where `config` is `"created"` or `"exists"`

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

### Requirement: Propose runs the draft review before presenting

The shipped propose skill SHALL run the draft review after validating the planning artifacts and before presenting the proposal to the user. It SHALL start the review, read the returned brief, write the self-review report when `reviewers` is 0, and stop when the review is not ready.

#### Scenario: Propose reaches the review gate

- **WHEN** the propose skill has written and validated the planning artifacts
- **THEN** it calls `openspec_review` with `action: "start"` and `review: "draft"` before presenting the proposal

#### Scenario: Self-review is required

- **WHEN** the change policy sets `reviewers: 0`
- **THEN** the skill tells the changer to read the returned brief and submit `self-report` with the review findings

#### Scenario: Review is not ready

- **WHEN** the draft review reports a blocker
- **THEN** the skill revises the artifacts and starts another round instead of presenting the proposal

### Requirement: Apply finishes with an apply review

The shipped apply skill SHALL run the apply review after the last task and before reporting completion. It SHALL commit the implementation, start the review, read the brief, submit the self-review report when `reviewers` is 0, and stop while the review is not ready.

#### Scenario: Apply reaches the review gate

- **WHEN** every task is complete and the implementation is committed
- **THEN** the skill calls `openspec_review` with `action: "start"` and `review: "apply"` before reporting completion

#### Scenario: Apply review is not ready

- **WHEN** the apply review reports a blocker
- **THEN** the skill fixes the finding and starts another round instead of reporting completion

### Requirement: Archive requires the apply review

The shipped archive skill SHALL check the apply review before calling `openspec_archive`. It SHALL stop when the review is enabled and not ready, and SHALL state that a project without git has no apply review.

#### Scenario: Archive starts after a ready review

- **WHEN** the user asks to archive and the apply review is ready
- **THEN** the skill calls `openspec_archive`

#### Scenario: Archive sees a blocked review

- **WHEN** the apply review is not ready
- **THEN** the skill stops and reports the review blockers

### Requirement: Workflow skills wait for the independent reviewer

The propose, apply and archive skills SHALL branch on `reviewers`. With `reviewers: 1` they SHALL start the review, call `wait`, and continue only after the reviewer submits or the user waives it. With `reviewers: 0` they SHALL keep the self-report path.

#### Scenario: Propose uses a reviewer

- **WHEN** the change sets `reviewers: 1`
- **THEN** the propose skill calls `start`, then `wait`, and does not submit a self-report

#### Scenario: Apply uses a reviewer

- **WHEN** the apply review sets `reviewers: 1`
- **THEN** the apply skill commits, starts the review and waits

#### Scenario: Self-review is unchanged

- **WHEN** the change sets `reviewers: 0`
- **THEN** the skill submits `self-report`
