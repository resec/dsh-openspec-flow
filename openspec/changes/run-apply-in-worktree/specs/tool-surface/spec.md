# Spec Delta

## MODIFIED Requirements

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review and the applicable lock before the apply state. An unready review names `openspec_review`; a foreign lock names the holder. Git worktree apply uses the per-change lock for implementation and keeps the store-domain lock; compatibility and non-git use the project lock. A first git apply needs the seal commit as base; a later draft mismatch does not refuse.

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

## ADDED Requirements

### Requirement: Apply tools expose the worktree and the session directory

`openspec_apply_next` SHALL return `worktree` with a path relative to `root.path`, branch, base and main root; `root.path` SHALL remain the main root. It SHALL move the changer session to the worktree before returning. `openspec_mark_task_done` and `openspec_inspect` `action: "validate"` SHALL use the worktree; the other inspect actions SHALL stay on main. `openspec_review` SHALL accept an optional `worktree` for apply review and activate the independent reviewer there.

#### Scenario: Apply next names the worktree and main root

- **WHEN** `openspec_apply_next` runs for a git change
- **THEN** `root.path` is the main root and `worktree.path` is relative to `root.path`

#### Scenario: Follow-up tools use the worktree

- **WHEN** `openspec_mark_task_done` or the validate action runs after apply starts
- **THEN** it uses the recorded worktree

#### Scenario: Other reads stay on main

- **WHEN** `openspec_inspect` runs `list`, `status`, `show`, `instructions` or `context`
- **THEN** it reads main

#### Scenario: Apply review uses the worktree

- **WHEN** `openspec_review` starts an apply review for a worktree-applied change
- **THEN** the reviewer is activated in that worktree

#### Scenario: An explicit worktree is accepted

- **WHEN** `openspec_review` receives a clean existing branch worktree
- **THEN** it runs the apply review there
