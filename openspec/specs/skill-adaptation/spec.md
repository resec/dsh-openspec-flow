# skill-adaptation Specification

## Purpose
Defines how the plugin initializes an OpenSpec project and keeps its shipped instruction text aligned with the tool surface.

## Requirements

### Requirement: Instructions output maps CLI commands to tools

The `openspec_instructions` result SHALL replace known CLI command fragments in the instruction text with the corresponding tool names.

#### Scenario: Proposal instruction is read

- **WHEN** `openspec_instructions` returns the proposal instruction on the bundled OpenSpec CLI
- **THEN** the text names `openspec_list`, `openspec_show` and `openspec_validate` instead of `openspec list --specs`, `openspec show` and `openspec validate`

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

The shipped workflow skills SHALL tell the agent to use the project `context`, per-artifact `rules` and operation `guidance` returned by the tools. The archive skill SHALL read the archive inputs with `openspec_instructions` before calling `openspec_archive`.

#### Scenario: Propose and update use artifact context and rules

- **WHEN** the propose or update skill writes or revises an artifact
- **THEN** it tells the agent to follow the `context` and `rules` returned by `openspec_instructions` for that artifact

#### Scenario: Apply uses apply context and guidance

- **WHEN** the apply skill reads the result of `openspec_apply_next`
- **THEN** it tells the agent to follow `context` and `guidance` when those fields are present

#### Scenario: Archive reads archive inputs first

- **WHEN** the archive skill starts for a change
- **THEN** it calls `openspec_instructions` with `artifact: "archive"` before `openspec_archive`
- **AND** it tells the agent to follow the returned `context` and `guidance` when present
- **AND** it proceeds when both fields are absent

### Requirement: Propose skill reads existing specs before proposing scope

The `openspec-propose` skill SHALL instruct the agent to inventory capabilities with `openspec_list` (`specs: true`), take a filtered overview with `openspec_show` (`type: "spec"`, `noScenarios: true`), and read each relevant capability in full with `openspec_show` (`type: "spec"`) before stating the change scope. It SHALL require the agent to surface a conflict with an existing requirement and ask instead of deciding it silently.

#### Scenario: Proposal scope is prepared

- **WHEN** the propose skill is loaded for a new change
- **THEN** it tells the agent to list capabilities, read each relevant spec in full, and name the capability and requirement behind each conclusion
- **AND** it tells the agent to surface a conflict with an existing requirement and ask

### Requirement: Explore skill reads relevant specs in full

The `openspec-explore` skill SHALL state that a filtered `openspec_show` read is only an overview and SHALL require a full read of every relevant spec, including scenarios, before the agent says what a capability covers or what should change. It SHALL keep the read bounded to what the question needs.

#### Scenario: Capability coverage is assessed

- **WHEN** the explore skill is used to assess what the project already covers
- **THEN** it tells the agent to start with the filtered read and then read every relevant spec in full, including scenarios
