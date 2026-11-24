# Spec Delta

## ADDED Requirements

### Requirement: A landing retry verifies the archive commit

When the state is `landing` and main carries exactly one commit after the branch tip, land SHALL treat that commit as the archive commit only when its tree no longer contains the change directory. Any other such commit SHALL refuse with a recovery instruction and leave main, the state, the worktree and the branch unchanged; land SHALL NOT repair main. A verified archive commit SHALL finish the land without archiving again.

#### Scenario: A commit after the branch tip is not the archive commit

- **WHEN** the state is `landing` and the one commit on main after the branch tip still carries the change directory in its tree
- **THEN** land refuses with a message that names the non-archive commit and a recovery action, and main `HEAD`, the `landing` state, the worktree, the branch and the change directory are unchanged

#### Scenario: The archive commit exists

- **WHEN** the state is `landing` and the one commit on main after the branch tip no longer carries the change directory
- **THEN** land records it as `archiveCommit` and finishes the manifest and cleanup without archiving again
