# flow-policy Specification

## Purpose
Defines the standing OpenSpec workflow rule the plugin adds to an agent's system prompt, and the project scoping that keeps it out of projects that do not use OpenSpec.

## Requirements

### Requirement: OpenSpec projects receive the flow rule

The plugin SHALL register a system prompt section for an agent whose current working directory is inside an OpenSpec project. The section SHALL state the workflow stage gates that apply to non-trivial work in that project.

#### Scenario: An agent works in an OpenSpec project

- **WHEN** an agent is created and its working directory contains an `openspec/` root
- **THEN** that agent's assembled system prompt contains the OpenSpec flow rule

#### Scenario: The rule states the stage gates

- **WHEN** the rule is present
- **THEN** it requires clarifying the request before proposing, confirming the change name and scope before creating a change, applying through `openspec_apply_next` and `openspec_mark_task_done`, validating with `openspec_validate` before completion, and archiving only on an explicit user request

### Requirement: Other projects receive no rule

The plugin SHALL NOT add the flow rule to an agent whose working directory has no OpenSpec root.

#### Scenario: An agent works outside OpenSpec

- **WHEN** an agent's working directory has no `openspec/` root
- **THEN** its assembled system prompt contains no OpenSpec flow section

### Requirement: The rule follows the working directory

The plugin SHALL evaluate project membership at each prompt assembly rather than only when the agent is created.

#### Scenario: The agent leaves an OpenSpec project

- **WHEN** an agent with the rule switches to a directory without an `openspec/` root
- **THEN** the next assembled system prompt omits the rule

#### Scenario: The agent returns to an OpenSpec project

- **WHEN** an agent without the rule switches back to a directory with an `openspec/` root
- **THEN** the next assembled system prompt contains the rule

### Requirement: Existing agents are covered at load time

The plugin SHALL attach the rule to agents that already exist when it loads, in addition to agents created later.

#### Scenario: The plugin reloads with a live agent

- **WHEN** the plugin starts while an OpenSpec-project agent is already live
- **THEN** that agent receives the rule without being recreated

### Requirement: Attachment is idempotent

The plugin SHALL register at most one flow section per agent.

#### Scenario: An agent is seen by both attachment paths

- **WHEN** the same agent is reachable through both the creation event and the load-time sweep
- **THEN** the plugin registers one section for that agent

### Requirement: The flow rule names only the tools

The registered flow rule SHALL name the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback.

#### Scenario: The rule is assembled

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow section contains no `CLI` token and no fallback sentence

#### Scenario: The rule text is edited

- **WHEN** a contributor changes `POLICY_TEXT` so that it names the CLI
- **THEN** `node --test test/` fails

### Requirement: The flow rule refuses sync-only work

The registered flow rule SHALL state that main specs are updated only by `openspec_archive`, that there is no sync-only flow, and that editing main specs outside archiving is unsupported.

#### Scenario: The user asks to update main specs without archiving
- **WHEN** an agent subject to the rule receives a request to update main specs without archiving the change
- **THEN** the rule says the flow is unsupported and points to archiving after the change is complete
