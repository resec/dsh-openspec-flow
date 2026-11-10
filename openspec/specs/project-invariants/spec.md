# project-invariants Specification

## Purpose
Holds the values more than one capability depends on - the Node runtime baseline, the OpenSpec CLI pin and the coverage floors - so a change to any of them has exactly one place to start.

## Requirements

### Requirement: Runtime baseline

The repository SHALL run on Node major 24 and declare `engines.node` as `>=24.9.0` in `package.json`, matching the lower bound declared by the pinned DSH runtime.

#### Scenario: The runtime is preflight-checked

- **WHEN** the test or coverage entrypoint checks the running Node version
- **THEN** it accepts only major 24 and a concrete version satisfying `>=24.9.0`

#### Scenario: The DSH runtime is upgraded

- **WHEN** the pinned DSH version declares a different `engines.node` bound
- **THEN** this requirement and `package.json` change in the same change

### Requirement: OpenSpec CLI pin

The plugin SHALL depend on exactly `@fission-ai/openspec` 1.16.1 and accept only schema envelope version 1.

#### Scenario: The bundled CLI reports another version

- **WHEN** `openspec version --json` reports a different version or schema envelope version
- **THEN** the plugin fails before running the requested command

### Requirement: Coverage floors

Each scope SHALL meet 90% line, 85% branch and 95% function coverage, new code SHALL meet 95% line, 90% branch and 100% function, and no scope or metric SHALL drop more than 1 percentage point below its baseline.

#### Scenario: A scope misses a floor

- **WHEN** a scope reports coverage below a floor
- **THEN** the coverage gate reports the shortfall with the scope name

### Requirement: Consumers reference these values

Every other capability SHALL reference this capability when a requirement depends on the runtime baseline, the CLI pin or the coverage floors, instead of restating the value.

#### Scenario: A consumer states a dependent requirement

- **WHEN** another capability states a requirement that depends on one of these values
- **THEN** it names this capability rather than repeating the version or threshold
