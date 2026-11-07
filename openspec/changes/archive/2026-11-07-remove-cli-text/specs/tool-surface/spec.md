# tool-surface Delta

## ADDED Requirements

### Requirement: Tool descriptions name only the tool surface

Every registered tool's JSON Schema description, including nested parameter and result-field descriptions, SHALL describe the data or the action without naming the OpenSpec CLI or a CLI fallback.

#### Scenario: Descriptions are scanned

- **WHEN** the test suite walks every registered tool's parameters and results
- **THEN** no description contains the token `CLI`

#### Scenario: A description is edited

- **WHEN** a contributor adds or changes a tool description that names the CLI
- **THEN** `node --test test/` fails and names the offending tool
