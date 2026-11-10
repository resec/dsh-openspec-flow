# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Node 24 preflight for tests and coverage`
- TO: `### Requirement: Runtime preflight for tests and coverage`

## MODIFIED Requirements

### Requirement: Runtime preflight for tests and coverage

Test and coverage commands SHALL start only when the `node` process running them has the major version and a concrete version satisfying the `engines.node` bound recorded in `project-invariants`. The check SHALL fail before any test starts and SHALL NOT invoke fnm, nvm, volta, or any other version manager.

#### Scenario: Primary runtime is accepted

- **WHEN** the command runs on a release with the registry's major version that satisfies its `engines.node` bound
- **THEN** the preflight passes and the test suite starts

#### Scenario: Non-primary major is rejected

- **WHEN** the command runs on a release whose major differs from the registry's
- **THEN** the preflight prints the current version and the required major
- **AND** exits nonzero before any test starts

#### Scenario: Below the declared range is rejected

- **WHEN** the command runs on a release of the registry's major that is below its `engines.node` bound
- **THEN** the preflight rejects the runtime and no test starts

#### Scenario: No version manager is required

- **WHEN** only a `node` executable is on PATH and no fnm, nvm, or volta is installed
- **THEN** the preflight still runs and accepts a runtime that satisfies the registry

### Requirement: Overall coverage floors

Each scope SHALL meet the line, branch and function floors recorded in `project-invariants` on its global aggregate.

#### Scenario: Floors are met exactly

- **WHEN** a scope reports exactly the registry's line, branch and function floors
- **THEN** the overall floor check passes

#### Scenario: A floor is missed

- **WHEN** a scope reports branch coverage below the registry's branch floor
- **THEN** the gate reports the branch shortfall with the scope name
