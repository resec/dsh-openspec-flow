# flow-policy Delta

## ADDED Requirements

### Requirement: The flow rule refuses sync-only work

The registered flow rule SHALL state that main specs are updated only by `openspec_archive`, that there is no sync-only flow, and that editing main specs outside archiving is unsupported.

#### Scenario: The user asks to update main specs without archiving
- **WHEN** an agent subject to the rule receives a request to update main specs without archiving the change
- **THEN** the rule says the flow is unsupported and points to archiving after the change is complete
