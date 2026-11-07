# skill-documentation Delta

## REMOVED Requirements

### Requirement: Skills state no CLI fallback

**Reason**: The sentence itself names the CLI, so a skill that must not reveal the CLI cannot carry it; the requirement forced the exact wording the change removes.

**Migration**: Replaced by "Skills name only the tool surface", which keeps the report-and-stop behavior without naming the CLI.

## MODIFIED Requirements

### Requirement: Skill text is guarded by tests

The test suite SHALL fail when a packaged skill contains the token `CLI`, a bare `openspec` command, or a command map.

#### Scenario: A CLI mention returns

- **WHEN** a packaged skill contains the token `CLI`
- **THEN** `node --test test/` fails and names the offending skill

#### Scenario: A command map returns

- **WHEN** a packaged skill contains `## Command map` or a fenced block starting with `openspec `
- **THEN** `node --test test/` fails and names the offending skill

## ADDED Requirements

### Requirement: Skills name only the tool surface

Each packaged skill SHALL describe its workflow only in terms of the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback. When a tool is unavailable, the skill SHALL instruct the agent to report the missing tool and stop.

#### Scenario: A skill is reviewed

- **WHEN** a contributor edits or adds a packaged skill document
- **THEN** the document contains no `CLI` token, no bare `openspec` command and no fallback sentence

#### Scenario: A tool is unavailable

- **WHEN** an agent loads a packaged skill in a session without the plugin tools
- **THEN** the skill says to report the missing tool and stop
