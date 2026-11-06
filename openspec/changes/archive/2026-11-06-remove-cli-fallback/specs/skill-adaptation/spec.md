# skill-adaptation Delta

## REMOVED Requirements

### Requirement: Skills prefer tools and fall back to CLI

**Reason**: The plugin resolves only its bundled OpenSpec CLI and exposes no CLI entry point, so a fallback instruction points the agent at a command the plugin does not provide and whose version no gate has checked.

**Migration**: Replaced by "Skills use tools and report missing tools". A project that needs the CLI when the plugin is absent must install and invoke it outside the skill workflow.

## ADDED Requirements

### Requirement: Skills use tools and report missing tools

Each generated skill SHALL direct the agent to the `openspec_*` tools for every workflow step and SHALL state that the plugin provides no CLI fallback. When a tool is unavailable, the skill SHALL instruct the agent to report the missing tool and stop.

#### Scenario: Tool surface is present

- **WHEN** the agent loads a generated skill in a session with the plugin tools
- **THEN** every workflow step in the skill names a tool call and no bare `openspec` command is required

#### Scenario: A tool is unavailable

- **WHEN** the agent loads a generated skill in a session without the plugin tools
- **THEN** the skill states that the plugin provides no CLI fallback and the agent reports the missing tool instead of running the CLI
