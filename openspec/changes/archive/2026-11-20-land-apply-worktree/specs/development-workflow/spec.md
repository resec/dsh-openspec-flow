# Spec Delta

## MODIFIED Requirements

### Requirement: Archive precedes commit and push

The repository SHALL archive a change before the archive commit is pushed to `origin/main`, so the archive commit carries the merged specs. A maintainer-authored change SHALL be archived before its implementation is pushed. An external contribution MAY merge its active change through a pull request; the maintainer SHALL archive it after merge, and the archive commit SHALL follow the apply review.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a maintainer-authored change's tasks are incomplete or `openspec_validate` fails
- **THEN** no archive commit is created and no implementation from that change is pushed

#### Scenario: An external contribution is merged before archive

- **WHEN** an external pull request carrying an active change is merged
- **THEN** the merge commit carries the active change
- **AND** the maintainer archives it after merge
- **AND** the archive commit follows the apply review

## ADDED Requirements

### Requirement: Land sequences the merge and archive commits

A maintainer worktree apply SHALL land as a merge commit that carries the implementation and its documentation, followed by an archive commit that carries the archive and merged specs; both SHALL precede the push to `origin/main`.

#### Scenario: A worktree change is landed

- **WHEN** `openspec_apply_worktree action=land` completes
- **THEN** the merge commit carries the implementation and its documentation
- **AND** the archive commit carries the archive and merged specs
- **AND** both are pushed together after the archive commit
