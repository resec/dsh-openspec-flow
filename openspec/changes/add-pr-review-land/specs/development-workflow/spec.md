## MODIFIED Requirements

### Requirement: Repository changes pass the review gates

The repository SHALL run draft review before implementation for maintainer-authored changes, and before merge for an external contribution whose change artifacts and implementation arrive in one pull request. It SHALL run apply review after implementation is committed and before archive, and SHALL not archive a change whose final apply review is not ready. For an external contribution under the PR review watch, it SHALL also run an apply review on the PR head or rebased branch before merge.

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
- **AND** runs the apply review on the pull request head or rebased branch before merge when the PR review watch is enabled
- **AND** runs the apply review before archive

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed tree
- **THEN** archive is refused
- **AND** the maintainer runs another apply review before archive

## ADDED Requirements

### Requirement: Labeled pull-request landing

The landing command SHALL merge a labeled external pull request with `gh pr merge --rebase`, and the session SHALL archive on main only when the merged tree equals the reviewed tree. It SHALL NOT archive a change whose reviewed tree differs from the merged tree.

#### Scenario: A labeled pull request lands

- **WHEN** the `mergeable` label is present and the final review is ready
- **THEN** the landing command merges with `gh pr merge --rebase` and the session archives on main after the tree matches

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed tree
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive
