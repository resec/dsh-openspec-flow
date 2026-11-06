# coverage-gate Specification

## Purpose
Defines how the repository measures and gates line, branch, and function coverage for the plugin scope on the primary Node runtime.

## Requirements

### Requirement: Node 24 preflight for tests and coverage

Test and coverage commands SHALL start only when the `node` process running them has major version 24 and a concrete version satisfying `engines.node`. The check SHALL fail before any test starts and SHALL NOT invoke fnm, nvm, volta, or any other version manager.

#### Scenario: Primary runtime is accepted

- **WHEN** the command runs on Node 24.22.2 and `engines.node` is `>=24.9.0`
- **THEN** the preflight passes and the test suite starts

#### Scenario: Non-primary major is rejected

- **WHEN** the command runs on Node 26.12.0
- **THEN** the preflight prints the current version and required major 24
- **AND** exits nonzero before any test starts

#### Scenario: Below the declared range is rejected

- **WHEN** the command runs on Node 24.8.9 and `engines.node` is `>=24.9.0`
- **THEN** the preflight rejects the runtime and no test starts

#### Scenario: No version manager is required

- **WHEN** only a `node` executable is on PATH and no fnm, nvm, or volta is installed
- **THEN** the preflight still runs and accepts a valid Node 24 runtime

### Requirement: Single-pass coverage collection

When coverage recording is enabled, the test command SHALL collect lcov during the same test execution that produces the test results. The gate SHALL consume that lcov and SHALL NOT run the test suites again.

#### Scenario: Coverage is enabled

- **WHEN** `COVERAGE=1` is set and the test command runs
- **THEN** the same run writes the scope lcov file and prints one test summary

#### Scenario: Coverage is disabled

- **WHEN** `COVERAGE` is unset and the test command runs
- **THEN** no lcov file is written

#### Scenario: Gate consumes an existing run

- **WHEN** the coverage gate evaluates a completed instrumented run
- **THEN** it reads the recorded lcov and does not spawn a test process again

### Requirement: Overall coverage floors

Each scope SHALL meet line coverage of at least 90.00 percent, branch coverage of at least 85.00 percent, and function coverage of at least 95.00 percent on its global aggregate.

#### Scenario: Floors are met exactly

- **WHEN** a scope reports 90.00 percent line, 85.00 percent branch, and 95.00 percent function
- **THEN** the overall floor check passes

#### Scenario: A floor is missed

- **WHEN** a scope reports branch coverage below 85.00 percent
- **THEN** the gate reports the branch shortfall with the scope name

### Requirement: Coverage delta guard

Each scope and metric SHALL stay within 1.00 percentage point below its recorded baseline. A drop of exactly 1.00 point SHALL pass; a larger drop SHALL fail.

#### Scenario: Allowed drop

- **WHEN** the current branch coverage is 1.00 point below the baseline
- **THEN** the delta check passes

#### Scenario: Excessive drop

- **WHEN** the current branch coverage is 1.01 points below the baseline
- **THEN** the delta check reports a violation

### Requirement: New-code coverage

For lines added or modified since `git merge-base origin/main HEAD`, the gate SHALL require line coverage of at least 95.00 percent, branch coverage of at least 90.00 percent, and function coverage of 100.00 percent. Untracked source files SHALL count as fully new.

#### Scenario: New code misses a function

- **WHEN** one new function has no recorded call
- **THEN** the new-code function check fails

#### Scenario: No new executable code

- **WHEN** the diff contains no added or modified executable lines
- **THEN** the new-code checks report not applicable and do not fail

### Requirement: Baseline Node validation

The baseline SHALL record the concrete Node version and the `engines.node` range used when it was generated. The gate SHALL accept different patch versions when both the current and baseline versions have major 24 and satisfy the current `engines.node`; it SHALL reject an invalid baseline.

#### Scenario: Patch versions differ

- **WHEN** the baseline records v24.22.2 and the current runtime is v24.9.0
- **THEN** the baseline is accepted and the report notes the patch difference

#### Scenario: Baseline from another major

- **WHEN** the baseline records a Node 26 version
- **THEN** the gate rejects the baseline and requires regeneration

#### Scenario: Range changed

- **WHEN** `engines.node` becomes `>=24.25.0` and the baseline records v24.22.2
- **THEN** the baseline is rejected and regeneration is required

### Requirement: Baseline ratchet

Updating the baseline SHALL refuse to lower any scope or metric unless the caller supplies an explicit override and reason. An accepted update SHALL record the concrete Node version and current `engines.node` range.

#### Scenario: Coverage improves

- **WHEN** the current figures exceed the baseline and the update command runs
- **THEN** the baseline is raised and records the current Node version

#### Scenario: Coverage would drop

- **WHEN** a metric would be lowered without the explicit override
- **THEN** the update is refused and the existing baseline is unchanged

#### Scenario: Lowering is justified

- **WHEN** the caller supplies the override and a reason
- **THEN** the baseline is lowered and the reason is recorded

### Requirement: Report and enforce modes

The gate SHALL support a report mode that prints coverage violations without failing and an enforce mode that fails on them. Preflight, missing-lcov, invalid-baseline, and test failures SHALL remain nonzero in both modes.

#### Scenario: Report mode

- **WHEN** a scope misses a floor while the gate runs in report mode
- **THEN** the violation is printed and the command exits zero

#### Scenario: Enforce mode

- **WHEN** a scope misses a floor while the gate runs in enforce mode
- **THEN** the command exits nonzero

#### Scenario: Tests fail

- **WHEN** the instrumented test run fails
- **THEN** the command returns the test failure and does not evaluate coverage

### Requirement: Plugin coverage scope

The gate SHALL evaluate a single plugin scope that includes `index.js` and `lib/**/*.js`. Test files and `node_modules` SHALL be excluded.

#### Scenario: The scope is reported

- **WHEN** the gate evaluates a completed run
- **THEN** the report shows line, branch and function figures for the plugin scope

#### Scenario: An in-scope source file has no coverage record

- **WHEN** a file in the plugin scope is absent from lcov
- **THEN** the gate reports a missing-coverage violation for that file
