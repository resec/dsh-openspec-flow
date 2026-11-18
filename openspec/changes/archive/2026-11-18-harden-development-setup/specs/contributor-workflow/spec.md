# contributor-workflow Delta

## ADDED Requirements

### Requirement: Bootstrap re-runs avoid duplicate work

Bootstrap SHALL accept `--skip-install` to reuse the dependencies already installed under `node_modules`, and SHALL fail with the `npm ci` instruction when that directory is absent. In full mode it SHALL run the instrumented verification and the lab without a separate plain test pass, because that verification executes the suite. The default mode SHALL keep installing dependencies and running the plain test suite.

#### Scenario: A re-run follows a failed lab step

- **WHEN** bootstrap runs with `--skip-install` and `--full` after a failed lab
- **THEN** the install step is skipped
- **AND** verification and the lab still run

#### Scenario: Dependencies are absent

- **WHEN** `--skip-install` runs without a `node_modules` directory
- **THEN** bootstrap exits nonzero before any test
- **AND** it names the `npm ci` command

#### Scenario: Full mode runs the suite once

- **WHEN** bootstrap runs in full mode
- **THEN** the instrumented verification executes the suite
- **AND** no separate plain test pass runs

#### Scenario: The default mode is unchanged

- **WHEN** bootstrap runs without options
- **THEN** it installs dependencies and runs the plain test suite

### Requirement: Bootstrap exposes download and browser recovery options

Bootstrap SHALL accept `--playwright-host URL` and pass it to the Chromium installer as the download host. It SHALL accept `--reset-browsers` to remove the clone-local `.cache/lab/pw-browsers` directory before installing, so a stale installer lock does not block the run. A reset SHALL run the Chromium installation even when a browser executable is already present. It SHALL refuse `--reset-browsers` when the browser installation is skipped.

#### Scenario: The download host is redirected

- **WHEN** bootstrap runs with `--playwright-host https://mirror.example`
- **THEN** the Chromium installer receives that value as its download host

#### Scenario: A stale lock blocks the browser install

- **WHEN** bootstrap runs with `--reset-browsers`
- **THEN** the clone-local browser directory is removed before the install
- **AND** the install proceeds

#### Scenario: A browser is already installed

- **WHEN** bootstrap runs with `--reset-browsers` and a browser executable already exists
- **THEN** the browser directory is removed
- **AND** the Chromium installation runs again

#### Scenario: Reset conflicts with a skipped install

- **WHEN** bootstrap runs with `--reset-browsers` and `--skip-playwright`
- **THEN** it exits nonzero
- **AND** the message names the conflicting options

### Requirement: Bootstrap names the lab cache and its cleanup

Bootstrap SHALL report the lab DSH cache location and the `npm run lab -- cache prune` command when it finishes, so a user can reclaim stale cached DSH installs without reading the lab documentation. It SHALL print the command without running it.

#### Scenario: A run finishes

- **WHEN** bootstrap completes successfully
- **THEN** its output names the lab DSH cache location
- **AND** it names the `npm run lab -- cache prune` command

#### Scenario: The hint does not prune

- **WHEN** bootstrap reports the cleanup command
- **THEN** it prints the command and executes no cleanup command

### Requirement: Contribution documents state the coverage gate

`CONTRIBUTING.md` SHALL state the coverage gate: the absolute line, branch and function floors, the 1.00 point baseline guard, the new-code thresholds, `npm run verify` as the completion command, and the report-only command that prints the same verdict. The stated numbers SHALL match `coverage.config.json`.

#### Scenario: A contributor reads the thresholds

- **WHEN** a contributor prepares a pull request
- **THEN** the contribution document states every threshold the gate enforces
- **AND** it names the command that reports the same verdict

#### Scenario: A documented number drifts

- **WHEN** `coverage.config.json` and `CONTRIBUTING.md` disagree
- **THEN** the documentation test fails and names the metric

#### Scenario: A row is mislabelled

- **WHEN** the absolute-floor and new-code rows label a metric differently from the configuration
- **THEN** the documentation test fails and names the row and metric

## MODIFIED Requirements

### Requirement: Bootstrap provisions the toolchain

The repository SHALL provide a bootstrap entrypoint that resolves a Node 24 runtime satisfying `engines.node` from the host or downloads and verifies the pinned fallback inside the clone, then installs locked dependencies, Git hooks and the Playwright Chromium binary under `.cache/lab/pw-browsers`. A full mode SHALL run `npm run verify` and `npm run test:lab -- --mock-only` in place of the plain test suite; the suite runs inside that verification.

#### Scenario: The host has a qualifying runtime

- **WHEN** a qualifying Node 24 is available on the host
- **THEN** bootstrap uses it and downloads no other runtime

#### Scenario: The host has no qualifying runtime

- **WHEN** no qualifying runtime exists on the host
- **THEN** bootstrap downloads the pinned version into the clone and verifies it before use

#### Scenario: Full mode runs the complete gate

- **WHEN** bootstrap runs in full mode and the doctor passes
- **THEN** dependencies, hooks and Chromium are provisioned
- **AND** verification and the lab run, with the suite executed inside verification
