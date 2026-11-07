# tool-surface Delta

## ADDED Requirements

### Requirement: No sync-only write tool

The plugin SHALL NOT expose a tool that applies a change's delta specs to main specs without archiving the change.

#### Scenario: A sync-only write is requested
- **WHEN** the user asks for a tool that merges delta specs without archiving
- **THEN** no such tool exists, and the flow rule states that the flow is unsupported
