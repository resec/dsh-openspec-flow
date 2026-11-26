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

The plugin SHALL depend on exactly `@fission-ai/openspec` 2.2.0 and accept only schema envelope version 1.

#### Scenario: The bundled CLI reports another version

- **WHEN** `openspec version --json` reports a different version or schema envelope version
- **THEN** the plugin fails before running the requested command

### Requirement: Coverage floors

Each scope SHALL meet 90% line, 85% branch and 95% function coverage, new code SHALL meet 95% line, 90% branch and 100% function, and no scope or metric SHALL drop more than 1 percentage point below its baseline.

#### Scenario: A scope misses a floor

- **WHEN** a scope reports coverage below a floor
- **THEN** the coverage gate reports the shortfall with the scope name

### Requirement: Consumers reference these values

Every other capability SHALL reference this capability when a requirement depends on the runtime baseline, the CLI pin or the coverage floors, instead of restating the value. `CONTRIBUTING.md` MAY restate the coverage floors as a contributor-facing snapshot; that copy SHALL be bound to `coverage.config.json` by a test, SHALL label each metric, and SHALL leave this capability as the source.

#### Scenario: A consumer states a dependent requirement

- **WHEN** another capability states a requirement that depends on one of these values
- **THEN** it names this capability rather than repeating the version or threshold

#### Scenario: The contribution document restates the floors

- **WHEN** `CONTRIBUTING.md` states the coverage floors
- **THEN** the documentation test compares each labelled value with `coverage.config.json`
- **AND** this capability remains the single source for the floors

### Requirement: Runtime imports stay built-in

The plugin SHALL import only Node built-ins and relative modules at runtime, and SHALL NOT declare an `@deepseek-ai/*` runtime dependency. The review card SHALL be stored as a file under the change's review directory; it SHALL NOT be appended as a Session event.

#### Scenario: A DSH import appears

- **WHEN** plugin source imports an `@deepseek-ai/*` package
- **THEN** the import check fails

#### Scenario: The manifest declares a DSH dependency

- **WHEN** `package.json` declares an `@deepseek-ai/*` runtime dependency
- **THEN** the package check fails

#### Scenario: The card data is a file

- **WHEN** a card is written
- **THEN** it lands under the review directory and no Session event is appended

### Requirement: pnpm pin follows the DSH target
The repository SHALL pin pnpm to the exact version the target DSH release declares in its source `packageManager`, currently `11.28.5` for DSH 0.2.2-rc.2. The pin SHALL be defined once in the toolchain module and read by every consumer. A DSH upgrade SHALL re-read the target tag's declaration and move the pin in the same change.

#### Scenario: A consumer needs the pnpm version
- **WHEN** bootstrap, the lab or CI selects a pnpm version
- **THEN** it reads the pin instead of a second literal

#### Scenario: A DSH upgrade moves the pin
- **WHEN** the target DSH tag declares a different pnpm version
- **THEN** the pin, the CI workflow, the lab documentation and the upgrade procedure move together

#### Scenario: The published package omits the declaration
- **WHEN** the installed DSH package declares no pnpm version
- **THEN** the repository pin remains the source
- **AND** bootstrap does not fetch the declaration at runtime

#### Scenario: A consumer drifts from the pin
- **WHEN** a consumer names a pnpm version other than the pin
- **THEN** its test fails and reports both versions
