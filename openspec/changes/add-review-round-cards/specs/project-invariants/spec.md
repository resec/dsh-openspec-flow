# Spec Delta: project-invariants

## ADDED Requirements

### Requirement: DSH session dependency pin

The plugin SHALL depend on exactly `@deepseek-ai/dsh-session` at the version pinned by `engines.dsh`, and SHALL import only that package plus Node built-ins at runtime.

#### Scenario: The versions differ

- **WHEN** the plugin's declared DSH session version differs from `engines.dsh`
- **THEN** the package check fails before the plugin loads

#### Scenario: A runtime import is outside the allowlist

- **WHEN** plugin source imports a DSH package other than `@deepseek-ai/dsh-session`
- **THEN** the import check fails

### Requirement: DSH session single instance

A packaged install SHALL resolve the plugin's `@deepseek-ai/dsh-session` and the Host's to the same module instance. The release SHALL stop when the probe finds different copies. At runtime a failed card write SHALL be logged and SHALL NOT roll back a stored report or a disposal.

#### Scenario: The copies match

- **WHEN** the plugin and Host resolve the same module path
- **THEN** the probe passes

#### Scenario: The module copies differ

- **WHEN** the plugin and Host resolve different instances
- **THEN** the install probe fails with an actionable error

#### Scenario: A card write fails at runtime

- **WHEN** writing a card record throws after a report was stored
- **THEN** the failure is logged and the stored report and review state are unchanged

### Requirement: The install probe proves the card channel

The probe SHALL import `@deepseek-ai/dsh-session` from the installed plugin path and from the Host path, create a Session through the Host copy, write a probe record through the plugin copy, and assert that the record is absent from the model-visible transcript.

#### Scenario: The probe writes through the Host Session

- **WHEN** the probe runs against a real profile
- **THEN** the Host-created Session receives the probe record
- **AND** the record is absent from the model-visible transcript

#### Scenario: The probe cannot write

- **WHEN** the probe write throws
- **THEN** the probe fails with an actionable error and the release stops
