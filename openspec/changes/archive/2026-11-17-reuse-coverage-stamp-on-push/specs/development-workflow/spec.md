# Spec Delta: development-workflow

## MODIFIED Requirements

### Requirement: Strict artifact validation gate

The pre-push hook SHALL validate every active change and main spec with warnings treated as failures, and SHALL check archived changes for completed tasks, before `npm run verify` runs. A failure in either validation step SHALL block the push. After validation, the hook SHALL skip only the `npm run verify` rerun when the coverage stamp verifies as `coverage-gate` defines it; apart from `COVERAGE_SKIP=1`, any other stamp outcome SHALL run verification.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the verification step

#### Scenario: A warning exists

- **WHEN** a main spec or an active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** the strict validation still runs before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation passes and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** the strict validation has already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation passes and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked
