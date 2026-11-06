# Spec Delta

## MODIFIED Requirements

### Requirement: Verification gates a change

The repository SHALL require OpenSpec validation, the plugin test suite, and the coverage gate before a change is considered complete.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec validate <name>` passes
- **AND** `npm test` passes on Node 24
- **AND** `npm run coverage:check` passes
