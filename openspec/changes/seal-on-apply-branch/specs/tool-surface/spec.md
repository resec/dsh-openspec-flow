# tool-surface delta

## MODIFIED Requirements

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review and the applicable lock before the apply state. An unready review names `openspec_review`; a foreign lock names the holder. Git worktree apply uses the per-change lock for implementation and keeps the store-domain lock; compatibility and non-git use the project lock. A first git worktree apply SHALL construct the seal commit in the same call and record it as the base; a later draft mismatch does not refuse.

#### Scenario: Review is not ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is not ready
- **THEN** the call fails, the apply state is unchanged and the error names `openspec_review`

#### Scenario: Review is ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is ready
- **THEN** the call proceeds and returns the apply projection

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the applicable lock

#### Scenario: Change has no policy

- **WHEN** a legacy change has no review policy
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the applicable lock

#### Scenario: Ready review passes apply

- **WHEN** the change has a ready draft review in a git worktree apply and the working tree matches the draft
- **THEN** `openspec_apply_next` proceeds, constructs the seal commit and records it as the apply base

#### Scenario: Dirty tree is refused before the seal

- **WHEN** a file outside the change directory, outside other `openspec/changes/**` directories and outside the plugin-written `openspec/.gitignore` has uncommitted changes before the first apply
- **THEN** the tool fails without changing the apply state and asks for a clean working tree

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain apart from the change directory and the plugin-written ignore file before the first apply
- **THEN** the tool proceeds

#### Scenario: Mixed seal commit is refused

- **WHEN** the worktree setting is disabled and `HEAD` also changes a file outside the change directory, `openspec/.gitignore` and `openspec/changes/` before the first apply
- **THEN** the tool fails and asks for a commit containing only OpenSpec change paths

#### Scenario: The construction stages only the change directory

- **WHEN** the working tree has other modified files before the first apply
- **THEN** the constructed seal commit changes only the change directory and the plugin-written ignore file

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

## ADDED Requirements

### Requirement: Apply resync tolerates a missing main planning copy

Once apply started, `openspec_apply_next` SHALL NOT read the change directory to resync. When the change directory is absent or changed in main, the call SHALL use the recorded apply base and SHALL NOT fail on the missing artifacts.

#### Scenario: The main copy is missing

- **WHEN** `openspec_apply_next` runs again after apply started and the change directory no longer exists in main
- **THEN** the call proceeds and reports the apply state without reading the artifacts
