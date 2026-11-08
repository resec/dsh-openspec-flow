# skill-adaptation Delta

## MODIFIED Requirements

### Requirement: Instructions output maps CLI commands to tools

The `openspec_instructions` result SHALL replace known CLI command fragments in the instruction text with the corresponding tool names.

#### Scenario: Proposal instruction is read

- **WHEN** `openspec_instructions` returns the proposal instruction on the bundled OpenSpec CLI
- **THEN** the text names `openspec_list`, `openspec_show` and `openspec_validate` instead of `openspec list --specs`, `openspec show` and `openspec validate`
