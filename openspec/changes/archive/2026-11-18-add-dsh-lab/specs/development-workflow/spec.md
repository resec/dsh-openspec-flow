# Spec Delta: development-workflow

## MODIFIED Requirements

### Requirement: Strict artifact validation gate

The pre-push hook SHALL validate every active change and main spec with warnings treated as failures, and SHALL check archived changes for completed tasks, before the reusable lab scenarios run. It SHALL then run `npm run test:lab -- --mock-only` before `npm run verify`; a lab failure SHALL block the push and SHALL NOT be skipped by `COVERAGE_SKIP=1`. A failure in either validation step or the lab gate SHALL block the push. After validation and the lab gate, the hook SHALL skip only the `npm run verify` rerun when the coverage stamp verifies as `coverage-gate` defines it; apart from `COVERAGE_SKIP=1`, any other stamp outcome SHALL run verification.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the lab gate

#### Scenario: A warning exists

- **WHEN** a main spec or an active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation and the lab gate still run before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation and the lab gate have already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

#### Scenario: Lab scenarios pass before verification

- **WHEN** strict validation passes and `npm run test:lab -- --mock-only` passes
- **THEN** the hook continues to the coverage step

#### Scenario: A lab scenario fails

- **WHEN** a reusable lab scenario fails
- **THEN** the hook exits nonzero before `npm run verify`
- **AND** the push is blocked

#### Scenario: Coverage is skipped but the lab gate runs

- **WHEN** `COVERAGE_SKIP=1` is set and a lab scenario fails
- **THEN** the hook still runs the lab gate
- **AND** the push is blocked
