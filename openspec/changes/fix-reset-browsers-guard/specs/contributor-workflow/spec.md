# Spec Delta

## ADDED Requirements

### Requirement: Bootstrap confines a browser reset to the repository

Bootstrap SHALL refuse `--reset-browsers` before deleting anything when the resolved browser directory is the repository root or lies outside it, and SHALL name the path, the reason and the explicit cleanup step in the message. It SHALL leave the refused directory and its browsers untouched and SHALL exit nonzero.

#### Scenario: A shared browser path is refused

- **WHEN** bootstrap runs with `--reset-browsers` and `PLAYWRIGHT_BROWSERS_PATH` names a directory outside the repository
- **THEN** it exits nonzero
- **AND** the message names that directory, says it is outside the repository and names the manual removal
- **AND** the directory and the browsers in it remain

#### Scenario: The repository root is refused

- **WHEN** bootstrap runs with `--reset-browsers` and the resolved browser directory is the repository root
- **THEN** it exits nonzero before deleting anything
- **AND** the message names the repository root as the refused target

#### Scenario: The default directory is still reset

- **WHEN** bootstrap runs with `--reset-browsers` and `PLAYWRIGHT_BROWSERS_PATH` is unset
- **THEN** the repository's `.cache/lab/pw-browsers` directory is removed before the install

## MODIFIED Requirements

### Requirement: Bootstrap exposes download and browser recovery options

Bootstrap SHALL accept `--playwright-host URL` and pass it to the Chromium installer as the download host. It SHALL accept `--reset-browsers` to remove the resolved browser directory inside the repository (`PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`) before installing, so a stale lock does not block the run. A reset SHALL run the Chromium installation even when a browser is already present. It SHALL refuse `--reset-browsers` when the browser installation is skipped.

#### Scenario: The download host is redirected

- **WHEN** bootstrap runs with `--playwright-host https://mirror.example`
- **THEN** the Chromium installer receives that value as its download host

#### Scenario: A stale lock blocks the browser install

- **WHEN** bootstrap runs with `--reset-browsers`
- **THEN** the resolved browser directory is removed before the install
- **AND** the install proceeds

#### Scenario: A browser is already installed

- **WHEN** bootstrap runs with `--reset-browsers` and a browser executable already exists
- **THEN** the resolved browser directory is removed
- **AND** the Chromium installation runs again

#### Scenario: Reset conflicts with a skipped install

- **WHEN** bootstrap runs with `--reset-browsers` and `--skip-playwright`
- **THEN** it exits nonzero
- **AND** the message names the conflicting options

#### Scenario: An explicit shared browser path is reset

- **WHEN** bootstrap runs with `--reset-browsers` and `PLAYWRIGHT_BROWSERS_PATH` names a directory inside the repository
- **THEN** it removes that resolved directory before installing
- **AND** it leaves the default `.cache/lab/pw-browsers` directory alone
