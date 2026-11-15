# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: Plain test runs reuse a Node compile cache

The repository's plain test entrypoint SHALL set `NODE_COMPILE_CACHE` to the absolute `.cache/node-compile` directory under the repository root for the test process and every CLI child process it starts. The cache directory SHALL be ignored by version control. The coverage entrypoint SHALL remove an inherited `NODE_COMPILE_CACHE` and SHALL NOT set one, because Node documents that deserialised bytecode can make V8 coverage less precise. Reusing the cache SHALL NOT change a test outcome.

#### Scenario: A repeat test run reuses compiled bytecode

- **WHEN** the plugin test suite runs a second time on the same checkout
- **THEN** its CLI child processes reuse the compile cache
- **AND** the suite reports the same pass and fail counts as the first run

#### Scenario: The cache directory stays untracked

- **WHEN** a test run creates `.cache/node-compile`
- **THEN** the repository's ignored-file rules keep it out of `git status`
- **AND** the fixture cleanup asserts that no recorded fixture root contains a `.cache` entry before it removes the root

#### Scenario: Coverage does not reuse the cache

- **WHEN** the coverage entrypoint runs the suite
- **THEN** the test process does not carry `NODE_COMPILE_CACHE`, even when the caller exported it
- **AND** the coverage gate reports its usual percentages

### Requirement: Review tests are split across focused files

The repository SHALL keep the review test cases split across focused `test/*.test.mjs` files that run in parallel. Shared review fixtures SHALL live in `test/review-fixtures.mjs` and SHALL NOT be copied into a test file.

#### Scenario: A review test is added

- **WHEN** a contributor adds a review test
- **THEN** the test belongs to the file for its topic
- **AND** it imports the shared review fixtures instead of copying them

#### Scenario: The suite still covers every review case

- **WHEN** the review tests are split across files
- **THEN** the suite contains the same review cases as before the split
- **AND** each case still runs against the real bundled CLI
