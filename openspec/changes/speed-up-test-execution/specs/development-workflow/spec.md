# Spec Delta

## MODIFIED Requirements

### Requirement: Review tests are split across focused files

The repository SHALL keep the review test cases split across focused `test/*.test.mjs` files that run in parallel. Shared review fixtures SHALL live in `test/review-fixtures.mjs` and SHALL NOT be copied into a test file. Review suites SHALL exercise the real bundled CLI in-process by default through the fake Host context, and the real child-process path SHALL stay covered by a dedicated contract test.

#### Scenario: A review test is added

- **WHEN** a contributor adds a review test
- **THEN** the test belongs to the file for its topic
- **AND** it imports the shared review fixtures instead of copying them

#### Scenario: The suite still covers every review case

- **WHEN** the review tests are split across files
- **THEN** the suite contains the same review cases as before the split
- **AND** each case still exercises the real bundled CLI, in-process by default, with the contract test covering a real child process

## ADDED Requirements

### Requirement: Review suites run the bundled CLI in-process by default

The review test suites SHALL execute the pinned bundled CLI through an in-process runner by default: calls are serialized, console output is captured, and the per-call working directory and environment are restored afterwards. The real child-process path SHALL remain selectable through an explicit spawn mode.

#### Scenario: A review suite runs by default

- **WHEN** a review suite runs without an explicit spawn mode
- **THEN** its CLI calls do not start a child process
- **AND** the suite reports the same cases and outcomes as the child-process mode

#### Scenario: The real child-process path stays covered

- **WHEN** the contract suite runs
- **THEN** it invokes the bundled CLI in a real child process
- **AND** it asserts the exit code, abort and output bounds

#### Scenario: Concurrent calls are serialized

- **WHEN** two CLI calls are issued at the same time
- **THEN** they run one after another
- **AND** their captured outputs do not interleave

### Requirement: In-process CLI calls preserve exit codes

An in-process CLI call SHALL report an exit code from either an explicit `process.exit` call or a `process.exitCode` assignment that returns, and SHALL restore the test process exit code afterwards.

#### Scenario: A failed CLI call keeps its exit code

- **WHEN** the in-process CLI assigns `process.exitCode` and returns without exiting
- **THEN** the tool observes that exit code
- **AND** the test process exit code is restored to its value before the call

### Requirement: Test entrypoints use a bounded test-file concurrency

The plain test entrypoint SHALL run test files with a concurrency of 8 by default and SHALL accept an explicit override through its argument passthrough. The coverage entrypoint and the affected-test selector SHALL pass the same default to the test run they start, so all three entrypoints use one concurrency policy.

#### Scenario: A plain run uses the default concurrency

- **WHEN** `npm test` starts
- **THEN** the test runner is given a test-file concurrency of 8

#### Scenario: An override is honored

- **WHEN** the caller passes `--test-concurrency=<n>` after `--`
- **THEN** the test runner uses that value instead of the default

#### Scenario: Coverage and affected runs share the default

- **WHEN** `npm run verify` or `npm run test:affected` starts tests
- **THEN** the test runner is given the same concurrency of 8
