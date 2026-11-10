# Spec Delta: skill-adaptation

## ADDED Requirements

### Requirement: Skills route gated tools through the admin command

A packaged skill that needs a management tool SHALL tell the agent to ask the user to run `/opsx-admin` and to continue after the tool appears. It SHALL NOT treat a gated tool as a missing plugin tool.

#### Scenario: Exploration needs the schema list

- **WHEN** the user asks which workflow the project follows and `openspec_schemas` is not exposed
- **THEN** the explore skill directs the agent to ask for `/opsx-admin` and to answer from the tool result after it appears

#### Scenario: Proposing finds a project that is not set up

- **WHEN** `openspec_list` returns `setup: false` and `openspec_init` is not exposed
- **THEN** the propose skill directs the agent to offer `/opsx-admin init`, a store target, or skipping OpenSpec

#### Scenario: The block is already open

- **WHEN** the management tool is exposed
- **THEN** the skill calls it directly without asking for the command
