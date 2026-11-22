# Spec Delta: apply-worktree

## ADDED Requirements

### Requirement: Archive commit message records the land commit

Land SHALL create the archive commit with the subject `chore(openspec): archive <change>` and no suffix. The commit body SHALL carry one line, `Landed from <landCommit>`, holding the full object id of the land commit the archive follows. A retry that completes a legacy merge or a pending archive SHALL use the same subject and body.

#### Scenario: A land writes the archive commit message

- **WHEN** `openspec_apply_worktree action=land` creates the archive commit
- **THEN** the commit subject is exactly `chore(openspec): archive <change>`
- **AND** the commit body carries `Landed from <full land commit object id>`

#### Scenario: A retry writes the archive commit message

- **WHEN** a retry creates the archive commit for an existing fast-forward or legacy merge
- **THEN** the commit subject is exactly `chore(openspec): archive <change>`
- **AND** the commit body carries `Landed from <full land commit object id>`
