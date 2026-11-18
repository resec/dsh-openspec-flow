# lab-harness Specification

## Purpose
An isolated, repeatable DSH environment for driving the packaged plugin and verifying its behavior without touching the development host.

## Requirements

### Requirement: The lab isolates every run

Each lab run SHALL create a temporary DSH home and agents home under its run directory, resolve the DSH version from the plugin's `engines.dsh`, and SHALL NOT modify the default `~/.dsh` profile, configuration or sessions. A version mismatch SHALL fail before the plugin runs.

#### Scenario: A headless run uses its own home

- **WHEN** a headless lab run starts
- **THEN** `DSH_HOME` and `DSH_AGENTS_HOME` point under that run's directory
- **AND** the run's profile and sessions are created there

#### Scenario: The host stays unchanged

- **WHEN** a lab run finishes
- **THEN** the development host's profile and credential files have the same hashes as before the run

#### Scenario: A version mismatch is refused

- **WHEN** the installed DSH version differs from the plugin's `engines.dsh`
- **THEN** the run fails before installing or driving the plugin
- **AND** the error names both versions

### Requirement: The lab caches the pinned DSH by version

The lab SHALL install `@deepseek-ai/dsh` at the plugin's `engines.dsh` version from npm into a cache keyed by version, Node major, platform and architecture, SHALL verify the installed entry and version before reuse, and SHALL support `--fresh-dsh` and `--offline`.

#### Scenario: A cache hit reuses the install

- **WHEN** the matching DSH cache entry exists and verifies
- **THEN** the run does not download DSH again
- **AND** the report records the cache key and a cache hit

#### Scenario: A fresh run installs temporarily

- **WHEN** `--fresh-dsh` is passed
- **THEN** the run installs a temporary DSH and does not reuse the cache
- **AND** the report records the fresh source

#### Scenario: Offline without a cache entry fails

- **WHEN** `--offline` is passed and the required cached DSH or package dependency is absent
- **THEN** the run fails without accessing a registry
- **AND** the error names the missing cache entry

#### Scenario: Fresh and offline are exclusive

- **WHEN** `--fresh-dsh` and `--offline` are passed together
- **THEN** the run fails before downloading anything

### Requirement: The lab installs the package under test every run

Every run SHALL install the plugin tarball into the isolated profile with the DSH plugin command, verify the profile's bundle selection and composed configuration, and record the tarball's version and sha512. A pre-push run SHALL pack the working tree and record whether it was dirty.

#### Scenario: The package installs and composes

- **WHEN** a run installs the plugin tarball
- **THEN** the profile's bundle list and `--dump-config` output contain the plugin row
- **AND** the report records the tarball version and sha512

#### Scenario: A dirty working tree is recorded

- **WHEN** a pre-push run packs a working tree with uncommitted files
- **THEN** the report records the dirty paths and the current `HEAD`
- **AND** the run does not fail only because the tree is dirty

#### Scenario: A missing bundle is refused

- **WHEN** the installed tarball does not add its bundle to the profile
- **THEN** the run fails before driving a surface
- **AND** the error names the missing bundle

### Requirement: The lab drives headless and Web GUI surfaces

The lab SHALL drive `dsh --profile <name> --json` and parse its events, SHALL launch the isolated web profile on an OS-assigned port, SHALL open it with Playwright, and SHALL call the review channel over HTTP with the startup token and cookie.

#### Scenario: Headless events are parsed

- **WHEN** a headless run completes
- **THEN** the lab exposes the session, tool call, tool result, final and error events
- **AND** the report records the exit status and final reason

#### Scenario: The Web GUI opens

- **WHEN** a web scenario opens the startup URL
- **THEN** the page loads without an uncaught page error
- **AND** the report keeps a screenshot

#### Scenario: The review channel answers

- **WHEN** a web scenario posts a client-request envelope to the review channel
- **THEN** the response carries the endpoint result
- **AND** the request uses the cookie obtained from the startup URL

#### Scenario: Onboarding is dismissed

- **WHEN** the page shows the preview notice or the get-started dialog
- **THEN** the web driver dismisses it before the scenario reads the page

#### Scenario: A workspace is selected

- **WHEN** the page asks for a workspace
- **THEN** the web driver selects the scenario's project directory
- **AND** the page shows that workspace before the scenario sends a message

### Requirement: The mock model is the default

Scenarios SHALL use a local OpenAI-compatible mock provider by default, supporting streamed and non-streamed replies. A real model SHALL require an explicit `--include-real-model` and SHALL be refused in pre-push, CI or a non-interactive run.

#### Scenario: A scenario runs against the mock

- **WHEN** a scenario does not opt into a real model
- **THEN** its DSH profile points the default model at the local mock
- **AND** the reply comes from the mock

#### Scenario: A real model is manual

- **WHEN** a developer passes `--include-real-model` in an interactive local run
- **THEN** the scenario may use the configured real model
- **AND** the report records the model source

#### Scenario: The gate never uses a real model

- **WHEN** `npm run test:lab -- --mock-only` runs in pre-push
- **THEN** scenarios declared for a real model are skipped
- **AND** the report lists them as skipped

### Requirement: Reusable scenarios and POCs have fixed locations

Reusable scenarios SHALL live under `test/lab/**/*.scenario.mjs` and SHALL NOT be collected by the plain test entrypoint or the affected-test selector. One-off POCs SHALL live under `.cache/lab/experiments/` and SHALL NOT be scanned by the pre-push gate.

#### Scenario: Plain tests exclude lab scenarios

- **WHEN** `npm test` runs
- **THEN** it does not start a lab scenario
- **AND** it only collects the top-level `test/*.test.mjs` files

#### Scenario: The lab runner runs scenarios

- **WHEN** `npm run test:lab` runs
- **THEN** it discovers the scenarios under `test/lab/`
- **AND** it does not discover POCs under `.cache/lab/experiments/`

#### Scenario: A POC is not gated

- **WHEN** a pre-push run starts
- **THEN** it ignores every file under `.cache/lab/experiments/`

### Requirement: The doctor preflight reports missing prerequisites

The lab SHALL provide a doctor command that reuses the repository's runtime preflight and checks pnpm, the DSH cache state, the Playwright browser binary, browser shared libraries, a CJK font and free disk. An absent DSH cache entry SHALL be reported as will-install, not as a failure; every other missing prerequisite SHALL fail with a correction-oriented message.

#### Scenario: All prerequisites are present

- **WHEN** `npm run lab -- doctor` runs on a prepared machine
- **THEN** it reports every check and exits zero

#### Scenario: pnpm is missing

- **WHEN** the `pnpm` executable is absent from `PATH`
- **THEN** the doctor exits nonzero
- **AND** it names the pinned pnpm version and an install command

#### Scenario: The first run has no DSH cache

- **WHEN** the DSH cache has no entry for the pinned version
- **THEN** the doctor reports that the run will install DSH
- **AND** it does not fail for the missing cache entry

#### Scenario: An unsupported runtime is rejected

- **WHEN** the running Node version fails the repository's runtime preflight
- **THEN** the doctor exits nonzero before any DSH process starts
- **AND** it references the runtime baseline instead of restating a major version

#### Scenario: The browser binary is missing

- **WHEN** the Playwright browser executable is absent from the lab browser path
- **THEN** the doctor exits nonzero
- **AND** it names the install command with `PLAYWRIGHT_BROWSERS_PATH` pointing under `.cache/lab/`

#### Scenario: A CJK font is missing

- **WHEN** the font check finds no CJK font
- **THEN** the doctor exits nonzero
- **AND** it names a font package or the `FONTCONFIG_FILE` override

#### Scenario: A browser library is missing

- **WHEN** the browser library check fails
- **THEN** the doctor exits nonzero
- **AND** it names the missing library and an install command

### Requirement: Reports and artifacts are evidence

Each run SHALL write a machine-readable report and keep the composed configuration, headless events, session logs, cards, screenshots and command logs unless `--cleanup` is requested. A failing run SHALL keep its full run directory. The report SHALL NOT contain tokens, cookies or API keys.

#### Scenario: A passing run writes a report

- **WHEN** a scenario passes without `--cleanup`
- **THEN** the report records the versions, checks, evidence paths and a success verdict
- **AND** the report and evidence are kept

#### Scenario: A passing run keeps its home

- **WHEN** a scenario passes with `--keep`
- **THEN** the run's isolated home, profile and project remain on disk

#### Scenario: A failing run keeps the scene

- **WHEN** a scenario fails
- **THEN** the full run directory and its artifacts remain
- **AND** the report records the failing check and the evidence path

#### Scenario: Secrets stay out of the report

- **WHEN** a web run obtains a cookie or a mock key
- **THEN** the report contains neither value

### Requirement: Playwright is development-only

The lab SHALL declare Playwright as a development dependency. The plugin runtime SHALL continue to import only Node built-ins and relative modules, and the published tarball SHALL NOT carry the harness or Playwright.

#### Scenario: The runtime stays built-in

- **WHEN** the runtime import check runs
- **THEN** it finds no `@deepseek-ai/*` import or dependency
- **AND** it finds no Playwright import in the plugin runtime

#### Scenario: The package excludes the harness

- **WHEN** the release tarball is inspected
- **THEN** it contains no `scripts/lab/`, `test/lab/` or Playwright files
