# skill-adaptation Specification

## Purpose
Defines how the plugin initializes an OpenSpec project and keeps its shipped instruction text aligned with the tool surface.

## Requirements

### Requirement: Instructions output maps CLI commands to tools

The `openspec_instructions` result SHALL replace known CLI command fragments in the instruction text with the corresponding tool names.

#### Scenario: Proposal instruction is read

- **WHEN** `openspec_instructions` returns the proposal instruction on OpenSpec 1.16.0
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
