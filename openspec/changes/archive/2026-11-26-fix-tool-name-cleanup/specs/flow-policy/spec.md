# Spec Delta

## MODIFIED Requirements

### Requirement: OpenSpec projects receive the flow rule

The plugin SHALL register a system prompt section for an agent whose current working directory is inside an OpenSpec project. The section SHALL state the workflow stage gates that apply to non-trivial work in that project.

#### Scenario: An agent works in an OpenSpec project

- **WHEN** an agent is created and its working directory contains an `openspec/` root
- **THEN** that agent's assembled system prompt contains the OpenSpec flow rule

#### Scenario: The rule states the stage gates

- **WHEN** the rule is present
- **THEN** it requires clarifying the request before proposing, confirming the change name and scope before creating a change, applying through `openspec_apply_next` and `openspec_mark_task_done`, validating with `openspec_inspect` (`action: "validate"`) before completion, and archiving only on an explicit user request
