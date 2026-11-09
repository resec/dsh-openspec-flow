# Development Workflow Specification

## MODIFIED Requirements

### Requirement: Verification gates a change

The repository SHALL require strict OpenSpec validation, the plugin test suite, and the coverage gate before a change is considered complete. Strict validation SHALL treat every warning as a failure.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec_validate` passes with `strict: true`
- **AND** `npm test` passes on Node 24
- **AND** `npm run coverage:check` passes

#### Scenario: A validation warning is present

- **WHEN** the change or a main spec reports a warning
- **THEN** strict validation fails and the change is not complete

## ADDED Requirements

### Requirement: Strict artifact validation gate

The pre-push hook SHALL validate every active change and main spec with warnings treated as failures, and SHALL check archived changes for completed tasks, before the coverage gate runs. A failure in either validation step SHALL block the push.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the coverage gate

#### Scenario: A warning exists

- **WHEN** a main spec or an active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** the strict validation still runs before the hook exits

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked
