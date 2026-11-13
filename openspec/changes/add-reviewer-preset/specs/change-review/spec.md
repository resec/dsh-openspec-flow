# change-review Specification Delta

## ADDED Requirements

### Requirement: One independent reviewer can run either review

The plugin SHALL accept `reviewers: 1` for draft and apply review. It SHALL start exactly one reviewer through a managed activation with caller delivery and the `openspec-reviewer` preset. It SHALL record the slot, child id and activation state.

#### Scenario: Draft review starts a reviewer

- **WHEN** a draft review starts with `reviewers: 1`
- **THEN** one reviewer activation starts and the record names its child id and slot

#### Scenario: Apply review starts a reviewer

- **WHEN** an apply review starts with `reviewers: 1`
- **THEN** one reviewer activation starts against the committed tree

#### Scenario: No reviewer service

- **WHEN** the subagent service is unavailable
- **THEN** the start fails instead of falling back to self-review

### Requirement: The changer waits for the reviewer report

`openspec_review` with `action: "wait"` SHALL wait for the reviewer's report or the review deadline. It SHALL return `waiting`, `ready` or `overdue`; it SHALL not treat a still-pending reviewer as pass.

#### Scenario: Reviewer submits

- **WHEN** the reviewer submits a report before the deadline
- **THEN** wait returns and the readiness calculation runs

#### Scenario: Deadline passes

- **WHEN** no report arrives before the wait limit
- **THEN** wait returns `overdue`

### Requirement: Reviewer failures can be handled without a new round

`openspec_review` SHALL accept `retry`, `replace` and `waive-reviewer` for the single slot. `retry` SHALL message the same reviewer, `replace` SHALL start a new reviewer and record the reason, and `waive-reviewer` SHALL require user approval and mark the coverage gap.

#### Scenario: A blocked reviewer is replaced

- **WHEN** the user replaces a blocked reviewer
- **THEN** the slot names the new child id and keeps the round number

#### Scenario: Reviewer coverage is waived

- **WHEN** the user waives the reviewer
- **THEN** the review may become ready only through the coverage-gap path

### Requirement: A waived reviewer is a coverage gap

A record with a user-waived reviewer SHALL skip the missing-report requirement but SHALL still require the artifact or tree hash, finding dispositions and a passing verdict from the remaining review content.

#### Scenario: Waived reviewer with no findings

- **WHEN** the reviewer is waived and no finding is open
- **THEN** readiness may pass with `coverageGap`

#### Scenario: Waived reviewer with an open blocker

- **WHEN** an open critical or major finding exists
- **THEN** readiness still fails
