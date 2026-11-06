# skill-documentation Delta

## REMOVED Requirements

### Requirement: Skills keep a prose fallback

**Reason**: The plugin provides no CLI fallback, so the prose fallback promised a capability the plugin does not offer and named a CLI source the runtime rejects.

**Migration**: Replaced by "Skills state no CLI fallback"; a skill loaded without the plugin tools now reports the missing tool.

## ADDED Requirements

### Requirement: Skills state no CLI fallback

Each skill SHALL state, in prose, that the plugin provides no CLI fallback and that a missing tool is reported rather than worked around. A skill SHALL NOT instruct the agent to run the `openspec` CLI.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document states that no CLI fallback is provided and does not tell the agent to run the CLI

#### Scenario: A tool is unavailable

- **WHEN** an agent loads a skill in a session without the plugin tools
- **THEN** the skill says to report the missing tool and stop
