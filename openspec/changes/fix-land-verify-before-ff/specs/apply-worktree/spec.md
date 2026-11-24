# Spec Delta

## MODIFIED Requirements

### Requirement: A failed land keeps a resumable state

A failed fast-forward, tree check, archive, commit or manifest write SHALL keep the worktree, SHALL NOT claim a completed land and SHALL be retryable without fast-forwarding twice or archiving twice. A completed fast-forward SHALL be retained only after its tree check passed and while main still points at the land commit. Land SHALL refuse before the fast-forward, with main unchanged, when the state's branch exists and the worktree head is not the tip of that branch.

#### Scenario: Archive fails after the merge

- **WHEN** the archive fails after a passed tree check
- **THEN** the fast-forward and worktree remain, no manifest exists and a retry resumes archive

#### Scenario: The archive commit fails

- **WHEN** the archive is written but its commit fails
- **THEN** the worktree and archive changes remain and a retry completes the commit

#### Scenario: The manifest write fails after the archive commit

- **WHEN** the archive commit succeeded but the manifest write failed
- **THEN** a retry detects the archive commit and writes only the manifest

#### Scenario: The worktree head is not the branch tip

- **WHEN** the state's branch exists, and the worktree head carries the required tree but is not the tip of that branch
- **THEN** land refuses before the fast-forward and names the branch, main is unchanged, the state stays `active`, and the worktree and branch remain
