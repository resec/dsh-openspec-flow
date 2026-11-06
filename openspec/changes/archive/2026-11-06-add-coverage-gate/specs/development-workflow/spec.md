# Development Workflow Delta

## MODIFIED Requirements

### Requirement: Verification gates a change

The repository SHALL require OpenSpec validation, the project test entrypoints, and the coverage gate before a change is considered complete.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec validate <name>` passes
- **AND** `npm test` passes on Node 24 for plugin changes, `npm run test:eval` for eval changes, or `npm run test:all` when both change
- **AND** `npm run coverage:check` passes
