# tool-surface Delta

## MODIFIED Requirements

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review and the apply locks before it reads or advances the apply state. An unready enabled draft review SHALL fail the call and name `openspec_review`. A lock naming a different identity SHALL fail the call and name the holder and the lock file paths, regardless of git, store, draft switch or policy; a store-domain lock also compares the implementation root, so a second project applying the same store change is refused. On the first apply after a ready draft review in a git project it SHALL require the sealed draft commit and record it as the apply base; once apply started it SHALL NOT refuse on a draft artifact hash mismatch.

#### Scenario: Review is not ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is not ready
- **THEN** the call fails, the apply state is unchanged and the error names `openspec_review`

#### Scenario: Review is ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is ready
- **THEN** the call proceeds and returns the apply projection

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the apply lock

#### Scenario: Change has no policy

- **WHEN** a legacy change has no review policy
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the apply lock

#### Scenario: Ready review passes apply

- **WHEN** the change has a ready draft review and a sealed draft commit
- **THEN** `openspec_apply_next` proceeds and records the seal commit as the apply base

#### Scenario: Dirty tree is refused before the seal

- **WHEN** the change directory or a file outside `openspec/changes/` has uncommitted changes before the first apply
- **THEN** the tool fails without changing the apply state and asks for a commit

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain before the first apply
- **THEN** the tool proceeds

#### Scenario: Mixed seal commit is refused

- **WHEN** `HEAD` changes files outside the change directory, `openspec/.gitignore` and `openspec/changes/` before the first apply
- **THEN** the tool fails and asks for a commit containing only OpenSpec change paths

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** apply already started and the draft artifact hash no longer matches
- **THEN** the tool does not refuse the call on that mismatch

#### Scenario: Another identity holds the apply lock

- **WHEN** a change whose draft review is ready calls `openspec_apply_next` while a lock names a different identity
- **THEN** the call fails, the apply state is unchanged and the error names the holder

#### Scenario: A store change from another project is refused

- **WHEN** a store change is applied from a second project while the store lock records the first project
- **THEN** the call fails because the implementation roots differ

#### Scenario: A non-git project enforces the lock

- **WHEN** a second change calls `openspec_apply_next` in a project without git while the lock names the first change
- **THEN** the call fails and names the holder

#### Scenario: The same implementation root re-enters apply

- **WHEN** `openspec_apply_next` runs again from the same implementation root for the change named by an apply lock
- **THEN** the call proceeds

### Requirement: Archive waits for a ready apply review

`openspec_archive` SHALL check the apply locks and the apply review before it reads the change list or runs validation. A lock naming a different identity SHALL fail the call, move no file and name the holder and the lock file paths. When apply review is enabled and not ready, the tool SHALL return no archive result and SHALL not move the change. When apply review is disabled or the project has no git, the tool SHALL proceed without that check. With no lock it SHALL proceed and write no lock. After a successful archive, it SHALL release the locks when they name the archived change.

#### Scenario: Apply review is not ready

- **WHEN** `openspec_archive` runs for a change whose apply review is not ready
- **THEN** the call fails, no file moves and the error names `openspec_review`

#### Scenario: Apply review is ready

- **WHEN** the apply review is ready and the tree matches
- **THEN** `openspec_archive` may proceed

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** `openspec_archive` proceeds without an apply check

#### Scenario: Another identity holds the apply lock

- **WHEN** `openspec_archive` runs for a change whose identity differs from a present lock's identity
- **THEN** the call fails and no file moves

#### Scenario: A store change from another project does not archive

- **WHEN** a store change is archived from a project other than the store lock's implementation root
- **THEN** the call fails and no file moves

#### Scenario: No lock naming another identity is required to archive

- **WHEN** no apply lock names another identity for a ready change
- **THEN** `openspec_archive` proceeds and writes no lock

#### Scenario: Archive releases its locks

- **WHEN** `openspec_archive` archives the change named by the present locks
- **THEN** every lock that names the change is removed after the archive succeeds

#### Scenario: Another change's uncommitted artifacts do not block archive

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain
- **THEN** archive proceeds
