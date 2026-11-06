# skill-documentation Specification

## Purpose
Defines what the plugin's shipped workflow skills may contain: tool calls and gates, a statement that no CLI fallback exists, and no CLI command tables.

## Requirements

### Requirement: Skills do not embed CLI command tables

A packaged workflow skill SHALL NOT contain a `## Command map` section or any table that pairs a CLI command with a tool name.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document has no `## Command map` heading and no table row whose first cell starts with an `openspec` command

### Requirement: Skill text is guarded by tests

The test suite SHALL fail when a packaged skill reintroduces a command map or a fenced CLI command.

#### Scenario: A command map returns

- **WHEN** a packaged skill contains `## Command map` or a fenced block starting with `openspec `
- **THEN** `node --test test/` fails and names the offending skill

### Requirement: Skills state no CLI fallback

Each skill SHALL state, in prose, that the plugin provides no CLI fallback and that a missing tool is reported rather than worked around. A skill SHALL NOT instruct the agent to run the `openspec` CLI.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document states that no CLI fallback is provided and does not tell the agent to run the CLI

#### Scenario: A tool is unavailable

- **WHEN** an agent loads a skill in a session without the plugin tools
- **THEN** the skill says to report the missing tool and stop
