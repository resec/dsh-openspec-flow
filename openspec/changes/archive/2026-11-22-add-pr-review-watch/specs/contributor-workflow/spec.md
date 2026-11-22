# Spec Delta

## MODIFIED Requirements

### Requirement: Maintainer controls review and archive

The maintainer SHALL review every external pull request, run the draft review before merge, and run an apply review on the PR head before merge when the PR review watch is enabled. Archive SHALL require a ready apply review for the merged tree: reuse the PR review when its tree equals the merged tree, otherwise review the merged tree. The merge commit MAY carry the active change; the archive commit SHALL follow it. Contributor-local review records SHALL NOT be required or committed.

#### Scenario: Review before merge

- **WHEN** an external pull request is ready
- **THEN** the maintainer runs the draft review before merging it

#### Scenario: Apply review before merge

- **WHEN** an external pull request is ready and the PR review watch is enabled
- **THEN** the maintainer runs an apply review on the pull request head before merging it

#### Scenario: Review before archive

- **WHEN** the merged change is to be archived
- **THEN** the maintainer archives it only after the apply review of the merged tree is ready

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed pull request head
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive

#### Scenario: Local review records stay local

- **WHEN** a contributor used the plugin locally
- **THEN** the review record stays local and the pull request remains self-contained
