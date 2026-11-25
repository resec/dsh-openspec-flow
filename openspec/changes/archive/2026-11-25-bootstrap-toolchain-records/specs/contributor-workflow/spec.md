# Spec Delta

## MODIFIED Requirements

### Requirement: Bootstrap provisions the toolchain

The repository SHALL provide a bootstrap entrypoint. It SHALL resolve a Node 24 runtime satisfying `engines.node` from the host or download and verify the pinned fallback into the shared bucket. In default and full runs it SHALL install locked dependencies, Git hooks, the pnpm bucket and Chromium under `PLAYWRIGHT_BROWSERS_PATH` when set, else the worktree's Playwright-version bucket. Full mode SHALL run `npm run verify` and `npm run test:lab -- --mock-only`; the suite runs inside verification.

#### Scenario: The host has a qualifying runtime

- **WHEN** a qualifying Node 24 is available on the host
- **THEN** bootstrap uses it and downloads no other runtime

#### Scenario: The host has no qualifying runtime

- **WHEN** no qualifying runtime exists on the host
- **THEN** bootstrap downloads the pinned version into the shared version bucket and verifies it before use

#### Scenario: Full mode runs the complete gate

- **WHEN** bootstrap runs in full mode and the doctor passes
- **THEN** dependencies, hooks, the pnpm bucket, Chromium and the toolchain record are provisioned
- **AND** verification and the lab run, with the suite executed inside verification

#### Scenario: The pnpm bucket is prepared

- **WHEN** bootstrap prepares pnpm
- **THEN** it installs the pinned version into the shared version bucket and the record names it

#### Scenario: An explicit browser path is used

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** bootstrap uses that path for the browser presence check and the Chromium installation

#### Scenario: No explicit path uses the default

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is unset
- **THEN** bootstrap uses the worktree's Playwright-version bucket

### Requirement: Bootstrap exposes download and browser recovery options

Bootstrap SHALL accept `--playwright-host URL` and pass it to the Chromium installer as the download host. It SHALL accept `--reset-browsers` to remove the resolved browser bucket (`PLAYWRIGHT_BROWSERS_PATH` when set, otherwise the worktree's Playwright-version bucket) before installing, so a stale lock does not block the run. A reset SHALL run the Chromium installation even when a browser executable is already present. It SHALL refuse `--reset-browsers` when the browser installation is skipped.

#### Scenario: The download host is redirected

- **WHEN** bootstrap runs with `--playwright-host https://mirror.example`
- **THEN** the Chromium installer receives that value as its download host

#### Scenario: A stale lock blocks the browser install

- **WHEN** bootstrap runs with `--reset-browsers`
- **THEN** the resolved browser bucket is removed before the install
- **AND** the install proceeds

#### Scenario: A browser is already installed

- **WHEN** bootstrap runs with `--reset-browsers` and a browser executable already exists
- **THEN** the resolved browser bucket is removed
- **AND** the Chromium installation runs again

#### Scenario: Reset conflicts with a skipped install

- **WHEN** bootstrap runs with `--reset-browsers` and `--skip-playwright`
- **THEN** it exits nonzero
- **AND** the message names the conflicting options

#### Scenario: An explicit shared browser path is reset

- **WHEN** bootstrap runs with `--reset-browsers` and `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** it removes that resolved directory before installing
- **AND** it leaves the default Playwright-version bucket alone

### Requirement: CI lab job provisions pnpm

The CI lab job SHALL install pnpm at the version the toolchain module pins, which is the value `project-invariants` defines, before `npm run lab -- doctor` and `npm run test:lab -- --mock-only`, because DSH forwards plugin installation to pnpm. The workflow test SHALL assert that the action is in the lab job before `npm ci`, that the version equals the pin, and that the lab documentation names the same version.

#### Scenario: A bare runner runs the lab

- **WHEN** the lab job starts on a runner without pnpm
- **THEN** it installs the pinned pnpm before the doctor and the lab
- **AND** the lab can add the plugin tarball

#### Scenario: The action is misplaced or unpinned

- **WHEN** the pnpm action is absent from the lab job, follows `npm ci`, or omits an explicit version
- **THEN** the workflow test fails and names the missing placement or pin

#### Scenario: The documented pin drifts

- **WHEN** the workflow's pnpm version, the version in `docs/lab.md` and the toolchain pin differ
- **THEN** the workflow test fails and reports all three versions

#### Scenario: The workflow pin drifts from the module

- **WHEN** the workflow pins a pnpm version other than the toolchain pin
- **THEN** the workflow test fails and names both versions
