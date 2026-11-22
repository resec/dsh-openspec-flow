# Spec Delta

## MODIFIED Requirements

### Requirement: Verification gates a change

The repository SHALL require strict OpenSpec validation and one verification command before a change is considered complete. That command SHALL run the plugin test suite and the coverage gate in a single instrumented run, so a separate plain test pass is never required. Strict validation SHALL treat every warning as a failure.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec_inspect` with `action: "validate"` and `strict: true` passes
- **AND** `npm run verify` passes on Node 24
- **AND** its output carries both the test summary and the coverage verdict

#### Scenario: The instrumented run fails a test

- **WHEN** a test fails during the verification run
- **THEN** `npm run verify` exits nonzero before the coverage gate is evaluated

#### Scenario: A validation warning is present

- **WHEN** the change or a main spec reports a warning
- **THEN** strict validation fails and the change is not complete

### Requirement: Archive precedes commit and push

The repository SHALL archive a change before the archive commit is pushed to `origin/main`, so the archive commit carries the merged specs. A maintainer-authored change SHALL be archived before its implementation is pushed. An external contribution MAY merge its active change through a pull request; the maintainer SHALL archive it after merge, and the archive commit SHALL follow the apply review.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a maintainer-authored change's tasks are incomplete or `openspec_inspect` with `action: "validate"` fails
- **THEN** no archive commit is created and no implementation from that change is pushed

#### Scenario: An external contribution is merged before archive

- **WHEN** an external pull request carrying an active change is merged
- **THEN** the merge commit carries the active change
- **AND** the maintainer archives it after merge
- **AND** the archive commit follows the apply review
