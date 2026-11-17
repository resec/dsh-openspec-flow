# Delta for development-workflow

## ADDED Requirements

### Requirement: Apply verifies touched tests between task batches

The repository SHALL provide a development-only selector returning the test files importing a changed module, directly or through a helper, without expanding the entry modules. A changed test file SHALL select itself; a changed entry module, a path outside the source and test trees, or any other path with no importing test SHALL select the full suite. Apply SHALL run the selection after each task batch and the full suite once before completion.

#### Scenario: A changed module selects its importing tests

- **WHEN** a task batch changes `lib/review/brief.js`
- **THEN** the selector lists `test/review-unit.test.mjs` and `test/review-reviewer.test.mjs`
- **AND** it does not list `test/review-apply.test.mjs`, which reaches the module only through the plugin entry

#### Scenario: A changed entry module selects the full suite

- **WHEN** a task batch changes `index.js`, `client.js`, `reviewer.js` or `lib/tools/index.js`
- **THEN** the selector lists every test file

#### Scenario: A path with no importing test selects the full suite

- **WHEN** the changed path has no importing test file, directly or through a helper, and is not a test file
- **THEN** the selector lists every test file

#### Scenario: A changed test file runs itself

- **WHEN** the changed path is a test file
- **THEN** the selector lists that test file

#### Scenario: An empty change set is reported, not expanded

- **WHEN** the selector runs without paths and the working tree is clean
- **THEN** it exits nonzero and says that no changed path was found

#### Scenario: The completion gate stays the full suite and the coverage gate

- **WHEN** every task is checked
- **THEN** `npm run verify` still decides completion, and a scoped run does not stand in for it

### Requirement: The scoped test entrypoint follows the plain-run test contract

The scoped test entrypoint SHALL run the node-version preflight before any test starts and SHALL reuse the compile-cache policy the repository's plain test entrypoint defines, so both entrypoints share one environment instead of duplicating the rule. A runtime the preflight rejects SHALL stop the run before a test executes. Listing a selection SHALL start no test process. A failing selected file SHALL surface its exit status.

#### Scenario: A scoped run follows the plain-run environment

- **WHEN** the scoped entrypoint runs a selected set
- **THEN** it applies the same compile-cache policy as the plain test entrypoint
- **AND** the run reports the same pass and fail counts as a plain run of those files

#### Scenario: A non-primary runtime stops before testing

- **WHEN** the selector runs on a runtime the preflight rejects
- **THEN** it reports the runtime and exits nonzero before any test starts

#### Scenario: A failing selected test yields a non-zero status

- **WHEN** one selected test file fails
- **THEN** the selector exits nonzero with that status

#### Scenario: Listing does not run tests

- **WHEN** the selector is given the list option and the run option together
- **THEN** it prints the selected files
- **AND** it starts no test process
