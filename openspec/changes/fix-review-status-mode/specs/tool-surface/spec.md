# Spec Delta

## ADDED Requirements

### Requirement: Review status reports the configured mode before start

`openspec_review` with `action: "status"` SHALL report `mode` and `independent` from the locked policy when the review has no record, is enabled and is available: `reviewers: 1` SHALL report `reviewer` and `true`; `reviewers: 0`, a disabled review or an unavailable review SHALL report `self` and `false`. No locked policy SHALL report `self` and `false` when the review has no record. A recorded review SHALL report its recorded mode and independence.

#### Scenario: Apply status before start with one reviewer

- **WHEN** a git project's locked policy enables apply review with `reviewers: 1` and the apply review has no record
- **THEN** the status reports `mode: "reviewer"` and `independent: true`
- **AND** it still reports `policy: true`, `enabled: true` and `available: true`

#### Scenario: Draft status before start with one reviewer

- **WHEN** a change's locked policy enables the draft review with `reviewers: 1` and the draft review has no record
- **THEN** the status reports `mode: "reviewer"` and `independent: true`

#### Scenario: A disabled draft policy keeps self

- **WHEN** a change's locked policy disables the draft review with `reviewers: 1` and the draft review has no record
- **THEN** the status reports `mode: "self"` and `independent: false`

#### Scenario: Status with a self review policy

- **WHEN** the locked policy sets the requested review to `reviewers: 0`
- **THEN** the status reports `mode: "self"` and `independent: false`

#### Scenario: A disabled apply policy keeps self

- **WHEN** a git project's locked policy disables apply review with `reviewers: 1`
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it reports `enabled: false` and does not ask for a start

#### Scenario: A no-git project keeps self

- **WHEN** the project has no git repository and the locked apply policy sets `reviewers: 1`
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it reports `available: false`

#### Scenario: Status without a locked policy

- **WHEN** the change has no policy file and the review has no record
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it does not fail

#### Scenario: A recorded review keeps its mode

- **WHEN** a review record exists with `mode: "reviewer"` and `independent: true`
- **THEN** the status reports those recorded values even when the policy would now resolve differently
