# CLI Bundling Delta

## Purpose

Defines the plugin's single OpenSpec CLI source and the version check that keeps the executable aligned with the code that projects its output.

## ADDED Requirements

### Requirement: The bundled CLI is the only executable source

The plugin SHALL execute only the `@fission-ai/openspec` package installed with the plugin. It MUST NOT use `PATH`, the session working directory, a project-local `node_modules/.bin/openspec`, or a caller-supplied path.

#### Scenario: PATH is ignored

- **WHEN** a different `openspec` executable exists on `PATH`
- **THEN** the plugin still runs the CLI from its own installation tree

#### Scenario: Project-local CLI is ignored

- **WHEN** the session working directory contains `node_modules/.bin/openspec`
- **THEN** the plugin does not execute that file

### Requirement: The bundled CLI version is pinned and verified

The plugin SHALL pin `@fission-ai/openspec` to an exact version and verify the executable before running any command.

#### Scenario: Matching version

- **WHEN** `openspec version --json` reports the pinned version and `schemaVersion: 1`
- **THEN** the command proceeds

#### Scenario: Mismatched version

- **WHEN** `openspec version --json` reports a different version or schema envelope version
- **THEN** the plugin fails before running the requested command
- **AND** the error names the pinned version and the reported version

### Requirement: The cliPath override is removed

The plugin SHALL reject a configuration that still supplies `cliPath`.

#### Scenario: Legacy cliPath is rejected

- **WHEN** the bundle row config contains `cliPath`
- **THEN** configuration validation returns an issue saying the field is no longer supported

### Requirement: An incomplete installation fails with a recovery action

The plugin SHALL fail closed when its OpenSpec dependency cannot be resolved or its `bin` entry is missing.

#### Scenario: Bundled package is missing

- **WHEN** the plugin's installation tree does not contain `@fission-ai/openspec`
- **THEN** a tool call fails with an error telling the user to reinstall the plugin

### Requirement: Version verification is cached per process

The plugin SHALL verify the bundled CLI once per process, not once per tool call.

#### Scenario: Repeated status calls

- **WHEN** several tools run in one process after a successful check
- **THEN** the version command is not spawned again
