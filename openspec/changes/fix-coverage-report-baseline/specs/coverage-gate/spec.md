# Spec Delta

## MODIFIED Requirements

### Requirement: Report and enforce modes

The gate SHALL support a report mode that prints coverage violations without failing and an enforce mode that fails on them. Preflight, missing-lcov, invalid-baseline, and test failures SHALL remain nonzero in both modes. A missing `coverage.baseline.json`, or one whose recorded Node version fails validation, SHALL count as an invalid baseline and stay nonzero in both modes unless the run updates the baseline. A baseline that cannot be parsed is not classified this way: it aborts the run in both modes, so regenerating it starts by removing the file.

#### Scenario: Report mode

- **WHEN** a scope misses a floor while the gate runs in report mode
- **THEN** the violation is printed and the command exits zero

#### Scenario: Enforce mode

- **WHEN** a scope misses a floor while the gate runs in enforce mode
- **THEN** the command exits nonzero

#### Scenario: Tests fail

- **WHEN** the instrumented test run fails
- **THEN** the command returns the test failure and does not evaluate coverage

#### Scenario: A missing or Node-invalid baseline fails both modes

- **WHEN** the gate runs in report mode and `coverage.baseline.json` is absent or records a Node version that fails validation
- **THEN** the command exits nonzero instead of printing a clean report
- **AND** a run that updates the baseline still completes and regenerates the file
