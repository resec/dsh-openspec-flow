# Spec Delta

## MODIFIED Requirements

### Requirement: Repository changes pass the review gates

The repository SHALL run draft review before implementation for maintainer-authored changes, and before merge for an external contribution whose change artifacts and implementation arrive in one pull request. It SHALL run apply review after implementation is committed and before archive, and SHALL not archive a change whose final apply review is not ready. For an external contribution under the PR review watch, it SHALL also run an apply review on the PR head before merge.

#### Scenario: A change starts implementation

- **WHEN** a maintainer starts apply
- **THEN** the draft review is ready or the apply tool refuses

#### Scenario: A change is archived

- **WHEN** a maintainer archives a change
- **THEN** the apply review is ready, or apply review is disabled or unavailable

#### Scenario: A review is not ready

- **WHEN** the draft or apply review reports a blocker
- **THEN** the change is not merged, implemented or archived until the blocker is fixed or waived

#### Scenario: An external contribution is reviewed

- **WHEN** a pull request carries an active change and its implementation together
- **THEN** the maintainer runs the draft review before merge
- **AND** runs the apply review on the pull request head before merge when the PR review watch is enabled

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed pull request head
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive
