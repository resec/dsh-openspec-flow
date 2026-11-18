# lab-harness Delta

## MODIFIED Requirements

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
