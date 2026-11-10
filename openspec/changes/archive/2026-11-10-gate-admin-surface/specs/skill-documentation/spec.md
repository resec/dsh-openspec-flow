# Spec Delta: skill-documentation

## MODIFIED Requirements

### Requirement: Skills name only the tool surface

Each packaged skill SHALL describe its workflow only in terms of the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback. When a tool is unavailable, the skill SHALL instruct the agent to report the missing tool and stop, except for a management tool that is absent because the management block is closed: that case SHALL direct the agent to ask the user to run `/opsx-admin`.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document contains no `CLI` token, no bare `openspec` command and no fallback sentence

#### Scenario: A tool is unavailable

- **WHEN** an agent loads a packaged skill in a session without the plugin tools
- **THEN** the skill says to report the missing tool and stop

#### Scenario: A gated tool is unavailable

- **WHEN** an agent loads a packaged skill and a management tool is absent because the block is closed
- **THEN** the skill says to ask the user for `/opsx-admin` instead of reporting the plugin as missing
