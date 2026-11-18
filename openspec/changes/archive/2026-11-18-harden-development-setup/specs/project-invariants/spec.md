# project-invariants Delta

## MODIFIED Requirements

### Requirement: Consumers reference these values

Every other capability SHALL reference this capability when a requirement depends on the runtime baseline, the CLI pin or the coverage floors, instead of restating the value. `CONTRIBUTING.md` MAY restate the coverage floors as a contributor-facing snapshot; that copy SHALL be bound to `coverage.config.json` by a test, SHALL label each metric, and SHALL leave this capability as the source.

#### Scenario: A consumer states a dependent requirement

- **WHEN** another capability states a requirement that depends on one of these values
- **THEN** it names this capability rather than repeating the version or threshold

#### Scenario: The contribution document restates the floors

- **WHEN** `CONTRIBUTING.md` states the coverage floors
- **THEN** the documentation test compares each labelled value with `coverage.config.json`
- **AND** this capability remains the single source for the floors
