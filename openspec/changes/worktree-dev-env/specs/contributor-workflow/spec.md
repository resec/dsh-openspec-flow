# Spec Delta

## ADDED Requirements

### Requirement: Explicit browser path precedence

When `PLAYWRIGHT_BROWSERS_PATH` is set, bootstrap SHALL use that absolute path for the Chromium presence check and installation instead of the default `.cache/lab/pw-browsers`; when it is unset, bootstrap SHALL use `.cache/lab/pw-browsers`.

#### Scenario: An explicit browser path is used

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** bootstrap uses that path for the browser presence check and the Chromium installation

#### Scenario: No explicit path uses the default

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is unset
- **THEN** bootstrap uses `.cache/lab/pw-browsers`

## MODIFIED Requirements

### Requirement: Bootstrap leaves host state alone

Bootstrap SHALL leave the host shell configuration, global Git configuration and DSH profiles unchanged. It SHALL NOT install host system packages, run `openspec init` or `openspec update`, install the plugin or write tracked repository files. Host runtime discovery SHALL read common global install directories without invoking a version manager. Downloads and caches SHALL stay under the clone's ignored cache directory or an explicitly configured shared cache path.

#### Scenario: Host state is unchanged

- **WHEN** bootstrap runs
- **THEN** shell rc files, global Git configuration and DSH profiles are unchanged

#### Scenario: The CLI is never initialized or updated

- **WHEN** bootstrap invokes the OpenSpec CLI
- **THEN** it runs only change-scoped or read-only commands

#### Scenario: Version managers are not invoked

- **WHEN** bootstrap discovers a runtime from a global install directory
- **THEN** it reads that directory without calling the version manager itself

#### Scenario: An explicit shared browser path is used

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` names an absolute path outside the clone
- **THEN** bootstrap writes the browser cache there and leaves the clone's local browser directory untouched

### Requirement: Bootstrap exposes download and browser recovery options

Bootstrap SHALL accept `--playwright-host URL` and pass it to the Chromium installer as the download host. It SHALL accept `--reset-browsers` to remove the resolved browser directory (`PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`) before installing, so a stale installer lock does not block the run. A reset SHALL run the Chromium installation even when a browser executable is already present. It SHALL refuse `--reset-browsers` when the browser installation is skipped.

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

- **WHEN** bootstrap runs with `--reset-browsers` and `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** it removes that resolved directory before installing
- **AND** it leaves the default `.cache/lab/pw-browsers` directory alone
