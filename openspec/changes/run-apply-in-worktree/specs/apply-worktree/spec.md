# Spec Delta

## MODIFIED Requirements

### Requirement: State carries every worktree fact

State file SHALL carry `schemaVersion`, `change`, `store`, `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status`, `createdAt`, `lastUsedAt`, `lockToken`, `lockPid`. `baseCommit` is the apply base; `sealedCommit` is the draft seal or null; `store` is null without a store; `lockToken`/`lockPid` are null for a PR state or after release. Every field SHALL be present; state is written only after a worktree exists. `status` is `active`, `landing` or `archived`.

#### Scenario: State round-trips

- **WHEN** the plugin writes state with every required field and reads it back
- **THEN** every field keeps its value

#### Scenario: A standalone PR state has no sealed commit

- **WHEN** state is written for a PR worktree reviewed with `baseline: "none"`
- **THEN** `sealedCommit` is `null` while `baseCommit` names the explicit base

#### Scenario: A PR state has no lock owner

- **WHEN** state is written for a user-created PR worktree
- **THEN** `lockToken` and `lockPid` are `null`

#### Scenario: A no-store state records null

- **WHEN** state is written for a change with no store
- **THEN** `store` is `null` while the file name still uses `local#<change>`

#### Scenario: A missing field is rejected

- **WHEN** a state document omits `worktree`, `branch`, `baseCommit`, `sealedCommit`, `lockToken` or `lockPid`
- **THEN** the plugin rejects the document and reports the missing field

#### Scenario: An unknown status is rejected

- **WHEN** a state document carries a status outside `active`, `landing` and `archived`
- **THEN** the plugin rejects the document

## ADDED Requirements


### Requirement: Apply worktree creation uses a state key and safe branch

The plugin SHALL create an apply worktree for a git project at `<mainRoot>/.cache/openspec-flow/worktrees/<stateKey>` from the recorded seal commit, where `stateKey` is `<store>#<change>` with `local#<change>` when no store is selected. The branch SHALL be `openspec/apply/<slug>-<hash>` where `slug` replaces every character outside `[A-Za-z0-9_-]` with `-` and `hash` is the first 8 hex characters of the state key's SHA-256.

#### Scenario: A git change creates one worktree

- **WHEN** `openspec_apply_next` starts a git change whose draft is ready and sealed
- **THEN** it creates the worktree and branch from the seal commit

#### Scenario: The drafted change is visible

- **WHEN** the worktree is created from the seal commit
- **THEN** `openspec/changes/<change>/` is present without copying uncommitted files

#### Scenario: A change name with a double dot gets a safe branch

- **WHEN** the change is named `release..1`
- **THEN** the dot becomes `-` and `git worktree add` succeeds

#### Scenario: A key starting with a dot gets a safe branch

- **WHEN** a store id starts with `.` so the state key starts with `.`
- **THEN** the slug starts with `-` and the branch is valid

#### Scenario: A non-git project keeps the single-tree apply

- **WHEN** the project has no git repository
- **THEN** `openspec_apply_next` proceeds without creating a worktree

#### Scenario: An existing state reuses its worktree

- **WHEN** the state is active and names a clean worktree on the expected branch
- **THEN** `openspec_apply_next` reuses it and moves the session to that worktree

### Requirement: Creation holds the change lock and publishes no partial state

Creation SHALL hold only the per-change change lock; it SHALL inspect but not acquire a legacy project-wide apply lock. It SHALL ensure the worktree root is ignored through `.git/info/exclude` when needed, create the worktree, move the changer session there, then write the state with the lock token and pid. A failure SHALL restore the session to main, remove the worktree, delete only the branch this call created, remove any state this call wrote, and release the change lock.

#### Scenario: The worktree root is locally ignored

- **WHEN** `.gitignore` does not ignore `.cache`
- **THEN** the plugin adds a worktree-relative root to `.git/info/exclude` and `git status` stays clean

#### Scenario: Creation moves the session before the state

- **WHEN** the worktree is created
- **THEN** the session moves first and the state is written with the lock token and pid

#### Scenario: A failed session move restores main

- **WHEN** the session move fails
- **THEN** the worktree, its branch and any state are removed and the changers cwd is unchanged

#### Scenario: A legacy apply lock still blocks

- **WHEN** a legacy project-wide apply lock names another change
- **THEN** a git worktree apply is refused and names the holder

#### Scenario: Creation failure leaves no partial state

- **WHEN** worktree creation or the state write fails
- **THEN** the created worktree and branch are removed, the locks are released and no state is published

### Requirement: Apply lock owner is recorded

The state SHALL record `lockToken` and `lockPid` for the per-change lock. The same pid presenting the recorded token MAY re-enter for an apply resync; a live foreign pid SHALL wait or be refused. When the recorded pid is dead and the lock is free, a caller MAY acquire it and replace the token/pid. The apply owner MAY reuse only an `active` state; a `landing` state belongs to land and apply SHALL refuse it.

#### Scenario: The apply owner re-enters for a resync

- **WHEN** `openspec_apply_next` runs again from the same pid with the recorded token
- **THEN** it proceeds instead of waiting

#### Scenario: A live foreign owner is refused

- **WHEN** a live foreign owner holds the lock and a caller without the token starts apply
- **THEN** the call waits or is refused naming that owner

#### Scenario: A second acquisition still fails

- **WHEN** a second apply starts from a different pid while the token is unchanged
- **THEN** the call fails naming the change lock owner

#### Scenario: A dead owner's free lock is reacquired

- **WHEN** the recorded pid is dead, the lock is free and a new session starts apply
- **THEN** it acquires the lock and replaces the state token/pid

#### Scenario: A landing state is refused

- **WHEN** apply runs for a change whose state is `landing`
- **THEN** it refuses and leaves the state to land

### Requirement: Git apply is serialized per change

For a git worktree apply, the plugin SHALL acquire the per-change lock instead of the project-wide implementation apply lock, so different changes can apply in parallel. The lifecycle lock SHALL cover removal, land and archive only.

#### Scenario: Two changes apply at once

- **WHEN** two changes with ready drafts start apply
- **THEN** each gets its own worktree and change lock

#### Scenario: The same change is serialized

- **WHEN** the same change starts apply from two different pids
- **THEN** the second call fails naming its change lock owner

#### Scenario: Creating one worktree does not block another apply

- **WHEN** one change is creating its worktree
- **THEN** another change's existing worktree can continue applying

### Requirement: Archive refuses a plugin-created worktree state

After the archive review gate, `openspec_archive` from any cwd SHALL refuse a plugin-created `active` or `landing` state whose worktree is under `<mainRoot>/.cache/openspec-flow/worktrees/` and SHALL name `openspec_apply_worktree action=land` plus the deployment dependency. A user-created PR state SHALL keep the existing archive path.

#### Scenario: Archive waits for land

- **WHEN** `openspec_archive` runs from main or the worktree for a plugin-created active or landing state
- **THEN** it refuses and names `openspec_apply_worktree action=land` and the deployment dependency

#### Scenario: A PR state archives after merge

- **WHEN** a PR-review state records a user-created worktree outside the plugin root
- **THEN** the existing archive path is unchanged
