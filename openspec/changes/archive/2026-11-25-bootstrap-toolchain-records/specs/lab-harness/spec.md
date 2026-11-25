# Spec Delta

## MODIFIED Requirements

### Requirement: The doctor preflight reports missing prerequisites

The lab SHALL provide a doctor command that reuses the repository's runtime preflight and checks pnpm, the DSH cache state, the Playwright browser binary, browser shared libraries, a CJK font and free disk. The pnpm check SHALL use the current worktree's recorded pnpm when a current record exists, else `PATH`, and SHALL require the pinned version. An absent DSH cache entry SHALL be reported as will-install, not as a failure; every other missing prerequisite SHALL fail with a correction.

#### Scenario: All prerequisites are present

- **WHEN** `npm run lab -- doctor` runs on a prepared machine
- **THEN** it reports every check and exits zero

#### Scenario: pnpm is missing

- **WHEN** no record exists and the `pnpm` executable is absent from `PATH`
- **THEN** the doctor exits nonzero
- **AND** it names the pinned pnpm version and a correction that prepares it

#### Scenario: A recorded pnpm is used

- **WHEN** the current worktree's record is current
- **THEN** the doctor checks the recorded pnpm and its version
- **AND** it does not require pnpm on `PATH`

#### Scenario: A recorded pnpm is missing

- **WHEN** the record exists but its pnpm path is missing
- **THEN** the doctor exits nonzero
- **AND** it names a new deps-only preparation instead of a global install

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
- **AND** it names the install command with the resolved browser path: an explicit `PLAYWRIGHT_BROWSERS_PATH`, the current record's browser path, or the Playwright-version bucket

#### Scenario: A CJK font is missing

- **WHEN** the font check finds no CJK font
- **THEN** the doctor exits nonzero
- **AND** it names a font package or the `FONTCONFIG_FILE` override

#### Scenario: A browser library is missing

- **WHEN** the browser library check fails
- **THEN** the doctor exits nonzero
- **AND** it names the missing library and an install command
