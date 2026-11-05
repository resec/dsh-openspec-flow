# Skill Documentation Specification

## Purpose

Defines what the plugin's shipped workflow skills may contain: tool calls and gates, a prose fallback to the CLI, and no redundant CLI command tables.

## ADDED Requirements

### Requirement: Skills do not embed CLI command tables

A packaged workflow skill SHALL NOT contain a `## Command map` section or any table that pairs a CLI command with a tool name.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document has no `## Command map` heading and no table row whose first cell starts with an `openspec` command

### Requirement: Skills keep a prose fallback

Each skill SHALL state, in prose, that the CLI is used only when the tools are unavailable, and SHALL NOT list CLI invocations as examples.

#### Scenario: Tools are unavailable

- **WHEN** an agent loads a skill in a session without the plugin tools
- **THEN** the skill tells it to fall back to the CLI and to say why, without naming a specific CLI command

### Requirement: Skill text is guarded by tests

The test suite SHALL fail when a packaged skill reintroduces a command map or a fenced CLI command.

#### Scenario: A command map returns

- **WHEN** a packaged skill contains `## Command map` or a fenced block starting with `openspec `
- **THEN** `node --test test/` fails and names the offending skill
