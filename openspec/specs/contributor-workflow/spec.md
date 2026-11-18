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

Every pull request SHALL add or update at least one active change under `openspec/changes/<name>/` and SHALL NOT archive that change. The change's `tasks.md` SHALL contain no unchecked task when the pull request is opened.

#### Scenario: Code arrives without a change

- **WHEN** a pull request changes code without touching an active change
- **THEN** CI rejects the pull request

#### Scenario: A task is unchecked

- **WHEN** the touched change's `tasks.md` contains an unchecked task
- **THEN** CI rejects the pull request

#### Scenario: A change is archived in the pull request

- **WHEN** a pull request moves or deletes a change under `openspec/changes/archive/`
- **THEN** CI rejects the pull request

### Requirement: Bootstrap provisions the toolchain

The repository SHALL provide a bootstrap entrypoint that resolves a Node 24 runtime satisfying `engines.node` from the host or downloads and verifies the pinned fallback inside the clone, then installs locked dependencies, Git hooks and the Playwright Chromium binary under `.cache/lab/pw-browsers`. A full mode SHALL add `npm run verify` and `npm run test:lab -- --mock-only`.

#### Scenario: The host has a qualifying runtime

- **WHEN** a qualifying Node 24 is available on the host
- **THEN** bootstrap uses it and downloads no other runtime

#### Scenario: The host has no qualifying runtime

- **WHEN** no qualifying runtime exists on the host
- **THEN** bootstrap downloads the pinned version into the clone and verifies it before use

#### Scenario: Full mode runs the complete gate

- **WHEN** bootstrap runs in full mode and the doctor passes
- **THEN** dependencies, hooks, Chromium, the tests, verification and the lab have run

### Requirement: Bootstrap leaves host state alone

Bootstrap SHALL leave the host shell configuration, global Git configuration and DSH profiles unchanged. It SHALL NOT install host system packages, run `openspec init` or `openspec update`, install the plugin or write tracked repository files. Host runtime discovery SHALL read common global install directories without invoking a version manager. Downloads and caches SHALL stay under the clone's ignored cache directory.

#### Scenario: Host state is unchanged

- **WHEN** bootstrap runs
- **THEN** shell rc files, global Git configuration and DSH profiles are unchanged

#### Scenario: The CLI is never initialized or updated

- **WHEN** bootstrap invokes the OpenSpec CLI
- **THEN** it runs only change-scoped or read-only commands

#### Scenario: Version managers are not invoked

- **WHEN** bootstrap discovers a runtime from a global install directory
- **THEN** it reads that directory without calling the version manager itself

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

The maintainer SHALL review every external pull request, run the draft review before merge, run the apply review before archive and archive after merge. The merge commit MAY carry the active change; the archive commit SHALL follow it. Contributor-local review records SHALL NOT be required and SHALL NOT be committed.

#### Scenario: Review before merge

- **WHEN** an external pull request is ready
- **THEN** the maintainer runs the draft review before merging it

#### Scenario: Review before archive

- **WHEN** the merged change is to be archived
- **THEN** the maintainer runs the apply review and archives it

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
