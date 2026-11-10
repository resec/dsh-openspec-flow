# Spec Delta: flow-policy

## ADDED Requirements

### Requirement: The flow rule names the management gate

The registered flow rule SHALL state that `openspec_init`, `openspec_store_list` and `openspec_schemas` require the user to run `/opsx-admin`, and SHALL direct the agent to ask for that command instead of reporting those tools as missing.

#### Scenario: The rule is assembled

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow section names `/opsx-admin` and the three management tools as gated

#### Scenario: The agent needs a management tool

- **WHEN** the agent needs to initialize a project, list stores or list schemas without the block open
- **THEN** the rule directs it to ask the user to run `/opsx-admin` and to continue only after the tool appears

#### Scenario: The rule is checked at prompt assembly

- **WHEN** the test suite reads the registered flow section
- **THEN** the section still contains no `CLI` token and no command fallback for the core flow
