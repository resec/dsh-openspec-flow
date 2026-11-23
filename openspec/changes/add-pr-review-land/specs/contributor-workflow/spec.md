## MODIFIED Requirements

### Requirement: Maintainer controls review and archive

The maintainer SHALL review every external pull request, run the draft review before merge, and run an apply review on the PR head or rebased branch before merge when the watch is enabled. Archive SHALL require a ready apply review for the merged tree: reuse the PR review when its tree equals the merged tree, otherwise review the merged tree. The merge commit MAY carry the active change; the archive commit SHALL follow it. Contributor-local review records SHALL NOT be required or committed.

#### Scenario: Review before merge

- **WHEN** an external pull request is ready
- **THEN** the maintainer runs the draft review before merging it

#### Scenario: Apply review before merge

- **WHEN** an external pull request is ready and the PR review watch is enabled
- **THEN** the maintainer runs an apply review on the pull request head or its rebased landing branch before merging it

#### Scenario: Review before archive

- **WHEN** the merged change is to be archived
- **THEN** the maintainer archives it only after a ready apply review whose tree equals the merged tree

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed tree
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive

#### Scenario: Local review records stay local

- **WHEN** a contributor used the plugin locally
- **THEN** the review record stays local and the pull request remains self-contained

## ADDED Requirements

### Requirement: Label-authorized pull-request landing

When the `mergeable` label is present and the final apply review is ready, the landing command SHALL merge with `gh pr merge --rebase` and the session SHALL archive on main after the merge only when the merged tree equals the reviewed tree. Neither SHALL add or remove the label, modify the contributor branch, squash, create a merge commit or force.

#### Scenario: The label authorizes landing

- **WHEN** a reviewed pull request carries the `mergeable` label
- **THEN** the landing command may merge it

#### Scenario: The label is absent

- **WHEN** the label is absent
- **THEN** the session leaves the pull request open and only comments the review

#### Scenario: The merged tree matches

- **WHEN** the merged main tree equals the reviewed tree
- **THEN** the session archives the change after the merge

#### Scenario: The merged tree differs

- **WHEN** the merged main tree differs from the reviewed tree
- **THEN** archive is refused until another review is ready
