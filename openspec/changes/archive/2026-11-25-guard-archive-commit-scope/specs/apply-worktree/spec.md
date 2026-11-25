# Spec Delta: apply-worktree

## MODIFIED Requirements

### Requirement: Land checks the main and worktree trees

`openspec_apply_worktree action=land` SHALL run in the main worktree after the handover under the lifecycle and fresh change locks and require main on `main`, clean main apart from other changes' uncommitted planning files, an empty git index, a clean worktree, a worktree containing the latest main, and a state naming that worktree and branch. The archived cleanup retry skips these checks. A worktree behind main SHALL be refused with a rebase, retest and re-review instruction.

#### Scenario: Another change's planning file is uncommitted

- **WHEN** main has an untracked or modified-but-unstaged file under another change's directory
- **THEN** land proceeds

#### Scenario: A staged path blocks land

- **WHEN** the git index carries any staged path
- **THEN** land refuses before updating main and names the staged paths

#### Scenario: The worktree is behind main

- **WHEN** the worktree does not contain the latest main
- **THEN** land refuses before merging

#### Scenario: A missing or foreign state is refused

- **WHEN** the change has no applicable state or the state names another worktree
- **THEN** land refuses before merging

### Requirement: A failed land keeps a resumable state

A failed fast-forward, tree check, archive, commit or manifest write SHALL keep the worktree, SHALL NOT claim a completed land and SHALL be retryable without fast-forwarding twice or archiving twice. A completed fast-forward SHALL be retained only after its tree check passed and while main still points at the land commit.

#### Scenario: Archive fails after the merge

- **WHEN** the archive fails after a passed tree check
- **THEN** the fast-forward and worktree remain, no manifest exists and a retry resumes archive

#### Scenario: The archive commit fails

- **WHEN** the archive is written but its commit fails, leaving the archive staging in the index
- **THEN** the worktree and archive changes remain and, after the operator unstages the interrupted staging with a mixed `git reset`, a retry completes the commit without archiving twice

#### Scenario: The manifest write fails after the archive commit

- **WHEN** the archive commit succeeded but the manifest write failed
- **THEN** a retry detects the archive commit and writes only the manifest

## ADDED Requirements

### Requirement: Archive commit stages only the archive scope

Land SHALL create the archive commit only after requiring an empty git index and verifying that the staged set is not empty and every staged path lies under the archive directory the archive operation reports, `openspec/specs`, or the removed source change directory. A path outside those prefixes SHALL refuse without committing and leave the index unchanged.

#### Scenario: The archive commit carries only the archive scope

- **WHEN** the archive operation has staged the moved change, the merged specs and the source deletion
- **THEN** the archive commit contains only those paths

#### Scenario: An out-of-scope staged path refuses the commit

- **WHEN** the index carries a staged path outside the archive scope
- **THEN** land refuses before committing and the index is unchanged

#### Scenario: A non-empty index refuses before staging

- **WHEN** the index already carries staged paths when the archive commit starts
- **THEN** land refuses and names the paths without resetting the index

#### Scenario: The archive produced no staged path

- **WHEN** staging leaves the index empty
- **THEN** land refuses without committing and the state stays `landing`

#### Scenario: Another change's untracked planning file is not committed

- **WHEN** main has an untracked file under another change's directory
- **THEN** the archive commit completes without that file and the file remains untracked

### Requirement: Resume staging resolves at most one archived directory

The resume path that stages an interrupted archive SHALL resolve at most one archived directory for the change. Zero matches SHALL mean the archive has not moved yet and the normal archive SHALL run; more than one match SHALL refuse without staging and leave the state `landing`.

#### Scenario: No archived directory is present before staging

- **WHEN** the resume path finds no archived directory for the change
- **THEN** land runs the normal archive and does not refuse

#### Scenario: The resumed directory is ambiguous before staging

- **WHEN** the resume path finds more than one archived directory for the change
- **THEN** land refuses before staging and the state stays `landing`

### Requirement: A resumed archive commit matches the archive scope

A land that accepts an archive commit already on main SHALL derive a single archived directory named `<date>-<change>`, or the change name when it already carries a date prefix, from that commit's added paths and verify that the commit changed only that directory, `openspec/specs`, and the removed source change directory. A commit with another path, with no such directory, or with more than one SHALL refuse before the manifest or state records the land.

#### Scenario: A resumed archive commit matches the scope

- **WHEN** a retry finds an archive commit whose added paths name one archived directory and whose remaining paths lie within the archive scope
- **THEN** the land resumes, writes the manifest and marks the state archived

#### Scenario: A resumed archive commit carries a foreign path

- **WHEN** the archive commit already on main also changes a path outside the archive scope
- **THEN** land refuses and the state stays `landing`

#### Scenario: The archived directory is missing or ambiguous

- **WHEN** the archive commit has no single archived directory for the change
- **THEN** land refuses and the state stays `landing`
