# Spec Delta: tool-surface

## ADDED Requirements

### Requirement: The review tool accepts no round cap

`openspec_review` SHALL NOT expose a `maxRounds` parameter. Its `extend` action SHALL accept only `minutes` for extending the wait limit, and the parameter schema SHALL reject a call that carries `maxRounds`. The removal SHALL NOT add or rename any result field.

#### Scenario: The parameter is absent

- **WHEN** an agent inspects the `openspec_review` parameter schema
- **THEN** `maxRounds` is not present
- **AND** `minutes` remains for `extend`

#### Scenario: A call carries the removed parameter

- **WHEN** a caller passes `maxRounds` to `openspec_review`
- **THEN** the parameter schema rejects the call before execution
