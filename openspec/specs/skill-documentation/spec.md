# skill-documentation Specification

## Purpose
Defines what the plugin's shipped workflow skills may contain: tool calls and gates, no CLI mentions or command tables, and a test guard.

## Requirements

### Requirement: Skills do not embed CLI command tables

A packaged workflow skill SHALL NOT contain a `## Command map` section or any table that pairs a CLI command with a tool name.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document has no `## Command map` heading and no table row whose first cell starts with an `openspec` command

### Requirement: Skill text is guarded by tests

The test suite SHALL fail when a packaged skill contains the token `CLI`, a bare `openspec` command, or a command map.

#### Scenario: A CLI mention returns

- **WHEN** a packaged skill contains the token `CLI`
- **THEN** `node --test test/` fails and names the offending skill

#### Scenario: A command map returns

- **WHEN** a packaged skill contains `## Command map` or a fenced block starting with `openspec `
- **THEN** `node --test test/` fails and names the offending skill

### Requirement: Skills name only the tool surface

Each packaged skill SHALL describe its workflow only in terms of the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback. When a tool is unavailable, the skill SHALL instruct the agent to report the missing tool and stop.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document contains no `CLI` token, no bare `openspec` command and no fallback sentence

#### Scenario: A tool is unavailable

- **WHEN** an agent loads a packaged skill in a session without the plugin tools
- **THEN** the skill says to report the missing tool and stop
