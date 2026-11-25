# Spec Delta

## ADDED Requirements

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
