# Spec Delta

## ADDED Requirements

### Requirement: Context projection preserves store identity and diagnostics

`openspec_context` SHALL keep the resolved root's store id, project every diagnostic with its recovery action, and express an available referenced store's fetch recipe as a tool action instead of command text.

#### Scenario: Root resolves from a store

- **WHEN** `openspec_context` resolves a root selected from a registered store
- **THEN** `root.store_id` is that store id
- **AND** `root.path` and `root.source` are unchanged

#### Scenario: Diagnostic carries a recovery action

- **WHEN** the CLI reports a top-level or member diagnostic with a code and a fix
- **THEN** the projected diagnostic keeps `severity`, `code`, `message` and `fix`

#### Scenario: Referenced store is available

- **WHEN** a referenced store has a path and no diagnostics
- **THEN** its `fetch` field names `openspec_show`, sets `type` to `spec`, and sets `store` to the member id
- **AND** the fetch field states that `name` is a spec id from that store
- **AND** the result contains no shell command

#### Scenario: Referenced store is unavailable

- **WHEN** a referenced store has no path
- **THEN** the member has no `fetch` field
- **AND** its `status` keeps the diagnostic code and fix

#### Scenario: Context call has no referenced stores

- **WHEN** a project declares no store references
- **THEN** `members` is an empty array
- **AND** `status` is an empty array when the root resolves without diagnostics
