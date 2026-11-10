# Spec Delta: tool-surface

## MODIFIED Requirements

### Requirement: Workflow steps are exposed as tools

The plugin SHALL expose the core change-flow tools — list, status, instructions, show, context, validate, apply, task marking, new change and archive — to every agent. It SHALL expose the management tools — schemas, store list and init — only while the management block is open. Every exposed step SHALL be performed through an `openspec_*` tool.

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

## ADDED Requirements

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
