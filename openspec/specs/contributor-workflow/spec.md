# contributor-workflow Specification

## Purpose
Defines the contribution path for people who do not have DSH, a DSH profile or the plugin tools, and the quality gates that keep their pull requests reviewable.

## Requirements

### Requirement: CLI-only contribution path

The repository SHALL provide a contribution path that uses only its OpenSpec CLI and npm scripts. That path SHALL NOT require DSH, a DSH profile, a model provider or the plugin tools. A contributor MAY install DSH or the plugin locally, but a pull request SHALL NOT depend on that installation.

#### Scenario: The CLI-only path completes

- **WHEN** a contributor follows the documented commands
- **THEN** change creation, validation, implementation and tests run without plugin tools

#### Scenario: A local installation is optional

- **WHEN** a contributor installs the plugin locally
- **THEN** the pull request still carries every required artifact and evidence item

### Requirement: Every pull request carries an active change

Every pull request SHALL add or update exactly one active change under `openspec/changes/<name>/` and SHALL NOT archive that change. The change's `tasks.md` SHALL contain no unchecked task when the pull request is opened.

#### Scenario: Code arrives without a change

- **WHEN** a pull request changes code without touching an active change
- **THEN** CI rejects the pull request

#### Scenario: Two active changes arrive

- **WHEN** a pull request touches two active change directories
- **THEN** CI rejects the pull request
- **AND** the error names both changes

#### Scenario: A task is unchecked

- **WHEN** the touched change's `tasks.md` contains an unchecked task
- **THEN** CI rejects the pull request

#### Scenario: A change is archived in the pull request

- **WHEN** a pull request moves or deletes a change under `openspec/changes/archive/`
- **THEN** CI rejects the pull request

### Requirement: Bootstrap provisions the toolchain

The repository SHALL provide a bootstrap entrypoint that resolves a Node 24 runtime satisfying `engines.node` from the host or downloads and verifies the pinned fallback inside the clone, then installs locked dependencies, Git hooks and the Playwright Chromium binary under `PLAYWRIGHT_BROWSERS_PATH` when set, else `.cache/lab/pw-browsers`. A full mode SHALL run `npm run verify` and `npm run test:lab -- --mock-only` in place of the plain test suite; the suite runs inside that verification.

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

#### Scenario: An explicit browser path is used

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** bootstrap uses that path for the browser presence check and the Chromium installation

#### Scenario: No explicit path uses the default

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is unset
- **THEN** bootstrap uses `.cache/lab/pw-browsers`

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

### Requirement: Bootstrap honors the lab prerequisites

Bootstrap SHALL run the lab doctor before any test and SHALL run the tests or the lab only after the doctor passes. When a lab prerequisite is missing, such as a Linux CJK font, bootstrap SHALL fail with the doctor's correction-oriented message and SHALL NOT report full mode as passed.

#### Scenario: The doctor passes

- **WHEN** every lab prerequisite is present
- **THEN** the test suite and, in full mode, verification and the lab run

#### Scenario: A prerequisite is missing

- **WHEN** the doctor reports a missing CJK font or another prerequisite
- **THEN** bootstrap exits nonzero with the correction-oriented message
- **AND** it does not claim that full mode passed

### Requirement: Node pin follows the runtime baseline

The fallback Node version downloaded by bootstrap and the Node version used by CI SHALL equal the concrete version recorded in `coverage.baseline.json` and SHALL satisfy the runtime baseline in `project-invariants`. A test SHALL fail when the two versions diverge from that record.

#### Scenario: The baseline version changes

- **WHEN** `coverage.baseline.json` records a new Node version
- **THEN** bootstrap's fallback and CI use that version
- **AND** the pin test fails if either still uses the previous version

### Requirement: CI gates every pull request on Ubuntu

A pull request SHALL run Ubuntu CI. One job SHALL run the change and generated-skill checks, `npm run openspec:check` and `npm run verify`. A second job SHALL install Chromium with `PLAYWRIGHT_BROWSERS_PATH` under `.cache/lab/pw-browsers`, run `npm run lab -- doctor` and `npm run test:lab -- --mock-only`. Both jobs SHALL use the Node version from `coverage.baseline.json`. The repository SHALL NOT add a macOS CI job; macOS remains a local verification target.

#### Scenario: A pull request is opened

- **WHEN** a pull request is opened
- **THEN** one job runs verification and a second job runs the lab

#### Scenario: Both jobs use the baseline runtime

- **WHEN** CI starts either job
- **THEN** it installs the Node version from `coverage.baseline.json`

#### Scenario: Chromium lands where the doctor looks

- **WHEN** the lab job installs Chromium
- **THEN** it sets `PLAYWRIGHT_BROWSERS_PATH` to `.cache/lab/pw-browsers`

#### Scenario: Lab inputs are cached

- **WHEN** the pinned DSH and Chromium are cached
- **THEN** the lab job reuses them

#### Scenario: macOS remains local

- **WHEN** a contributor tests on macOS
- **THEN** the check is local and CI stays Ubuntu-only

### Requirement: Generated OpenSpec skills stay untracked

The repository SHALL ignore OpenSpec-generated skill directories matching `**/skills/openspec-*/` while keeping its own root `skills/openspec-*/`. CI SHALL reject a pull request that adds or changes a generated skill path, or a file carrying the generated frontmatter markers. Local installation SHALL remain allowed when it is not committed.

#### Scenario: Skills are installed locally

- **WHEN** a contributor installs OpenSpec skills locally
- **THEN** they are ignored and do not enter the pull request

#### Scenario: A generated copy enters the diff

- **WHEN** a pull request adds `.dsh/skills/openspec-propose/SKILL.md` or a renamed copy
- **THEN** CI rejects the pull request

#### Scenario: The repository's own skill changes

- **WHEN** a pull request changes the repository's root `skills/openspec-*`
- **THEN** the change is not treated as a generated copy

### Requirement: Restricted paths stay out of external pull requests

The repository SHALL restrict pull requests from changing `.githooks/`, `.github/workflows/`, `coverage.baseline.json`, `dist/`, `openspec/changes/archive/` and dependency versions in `package.json` and `package-lock.json`. CI SHALL fail on any of those paths. A restricted change SHALL be made in a separate maintainer-authored change, not in an external pull request.

#### Scenario: A restricted path changes

- **WHEN** a pull request changes one of these paths
- **THEN** CI fails and names the path

#### Scenario: A restricted change is needed

- **WHEN** the maintainer decides a restricted change is required
- **THEN** the change is made in a separate maintainer-authored change
- **AND** the external pull request stays clean

### Requirement: Maintainer controls review and archive

The maintainer SHALL review every external pull request, run the draft review before merge, and run an apply review on the PR head before merge when the PR review watch is enabled. Archive SHALL require a ready apply review for the merged tree: reuse the PR review when its tree equals the merged tree, otherwise review the merged tree. The merge commit MAY carry the active change; the archive commit SHALL follow it. Contributor-local review records SHALL NOT be required or committed.

#### Scenario: Review before merge

- **WHEN** an external pull request is ready
- **THEN** the maintainer runs the draft review before merging it

#### Scenario: Apply review before merge

- **WHEN** an external pull request is ready and the PR review watch is enabled
- **THEN** the maintainer runs an apply review on the pull request head before merging it

#### Scenario: Review before archive

- **WHEN** the merged change is to be archived
- **THEN** the maintainer archives it only after the apply review of the merged tree is ready

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed pull request head
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive

#### Scenario: Local review records stay local

- **WHEN** a contributor used the plugin locally
- **THEN** the review record stays local and the pull request remains self-contained

### Requirement: Contribution documents and templates are English

`CONTRIBUTING.md`, the issue templates and the pull request template SHALL be written in English. They SHALL state the CLI-only path, the required evidence, the restricted paths and the maintainer's review and archive responsibilities.

#### Scenario: An issue is opened

- **WHEN** a contributor opens an issue
- **THEN** the template asks for reproduction, acceptance commands, scope and evidence

#### Scenario: A pull request is opened

- **WHEN** a contributor opens a pull request
- **THEN** the template asks for the change name, linked issue, evidence and risk

### Requirement: Bootstrap and checks are tested

The bootstrap selection and planning logic, the change checks, the generated-skill checks and the Node pin SHALL be covered by plain Node tests that do not access the network. `npm run verify` SHALL remain the completion gate.

#### Scenario: The test suite covers the new checks

- **WHEN** the test suite runs
- **THEN** it exercises host runtime selection, download asset selection, change and task checks, generated-skill detection and node-pin consistency without network access

### Requirement: CI lab job provisions pnpm

The CI lab job SHALL install a pinned pnpm before `npm run lab -- doctor` and `npm run test:lab -- --mock-only`, because DSH forwards plugin installation to pnpm. The workflow test SHALL assert that the action is in the lab job before `npm ci`, that the version is pinned, and that the lab documentation names the same version.

#### Scenario: A bare runner runs the lab

- **WHEN** the lab job starts on a runner without pnpm
- **THEN** it installs the pinned pnpm before the doctor and the lab
- **AND** the lab can add the plugin tarball

#### Scenario: The action is misplaced or unpinned

- **WHEN** the pnpm action is absent from the lab job, follows `npm ci`, or omits an explicit version
- **THEN** the workflow test fails and names the missing placement or pin

#### Scenario: The documented pin drifts

- **WHEN** the workflow's pnpm version and the version in `docs/lab.md` differ
- **THEN** the workflow test fails and reports both versions

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

### Requirement: The lab job installs a CJK font

The CI lab job SHALL install `fonts-wqy-zenhei` before `npm run lab -- doctor`, so the doctor's CJK font check passes without the larger `fonts-noto-cjk` download. The workflow test SHALL assert the package the workflow installs.

#### Scenario: The lab job installs its CJK font

- **WHEN** the lab job prepares the doctor's prerequisites
- **THEN** it installs `fonts-wqy-zenhei` before `npm run lab -- doctor`
- **AND** the workflow test asserts that package name

### Requirement: The CI actions declare the Node 24 runtime

The CI workflow SHALL use GitHub Actions releases that declare the Node 24 runtime: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/cache@v6` and `pnpm/action-setup@v6`. The workflow test SHALL assert each of those major versions so a downgrade to a Node 20 release fails the suite.

#### Scenario: The workflow uses Node 24 actions

- **WHEN** the CI workflow runs
- **THEN** every action it uses declares the Node 24 runtime
- **AND** the workflow test asserts the four pinned major versions

#### Scenario: A Node 20 release is reintroduced

- **WHEN** an action reference is changed back to its Node 20 major version
- **THEN** `test/ci-workflow.test.mjs` fails
