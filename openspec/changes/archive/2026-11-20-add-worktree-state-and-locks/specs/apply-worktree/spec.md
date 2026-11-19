# Spec Delta

## Purpose

Tracks the checkout and locks that let one change apply in its own worktree while other changes proceed, and provides a read-only inspection surface plus an explicit recovery action.

## ADDED Requirements

### Requirement: Apply worktree state is change-scoped and shared

In a git project the plugin SHALL keep one apply worktree state file per change at `<git common dir>/openspec-flow/apply/<store>#<change>.json`, using `local#<change>` when no store is selected. A project without git SHALL report apply worktree state as unavailable and SHALL NOT write the file. The file SHALL be shared by the main worktree and every linked worktree.

#### Scenario: A git project writes one state file

- **WHEN** the plugin records apply worktree state for a change in a git project
- **THEN** it writes `<git common dir>/openspec-flow/apply/<store>#<change>.json`

#### Scenario: Linked worktrees read the same state

- **WHEN** the main worktree and a linked worktree read the same change's apply worktree state
- **THEN** both read the same file under the git common directory

#### Scenario: A non-git project writes no state

- **WHEN** the project has no git repository
- **THEN** the plugin reports apply worktree state as unavailable and writes no file

### Requirement: State carries every worktree fact

The state file SHALL carry `schemaVersion`, `change`, `store`, `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status`, `createdAt` and `lastUsedAt`. `store` SHALL be `null` when no store is selected; `baseCommit` SHALL be the apply base and `sealedCommit` the draft seal commit, or `null` when a standalone apply review has no draft seal. Every field SHALL be present; the state is written only after a worktree exists. `status` SHALL be one of `active`, `landed` or `archived`.

#### Scenario: State round-trips

- **WHEN** the plugin writes state with every required field and reads it back
- **THEN** every field keeps its value

#### Scenario: A standalone PR state has no sealed commit

- **WHEN** state is written for a PR worktree reviewed with `baseline: "none"`
- **THEN** `sealedCommit` is `null` while `baseCommit` names the explicit base

#### Scenario: A no-store state records null

- **WHEN** state is written for a change with no store
- **THEN** `store` is `null` while the file name still uses `local#<change>`

#### Scenario: A missing field is rejected

- **WHEN** a state document omits `worktree`, `branch`, `baseCommit` or `sealedCommit`
- **THEN** the plugin rejects the document and reports the missing field

#### Scenario: An unknown status is rejected

- **WHEN** a state document carries a status outside `active`, `landed` and `archived`
- **THEN** the plugin rejects the document

### Requirement: State rejects environment fields

The state file SHALL NOT carry dependency-cache, browser, DSH-profile, port or other development-environment fields. A document carrying one SHALL be rejected.

#### Scenario: An environment field is refused

- **WHEN** a state document carries a cache, browser, profile or port field
- **THEN** the plugin rejects the document instead of accepting it

#### Scenario: An unknown field is rejected

- **WHEN** a state document carries an unknown field
- **THEN** the plugin rejects the document and names the field

### Requirement: State writes are atomic

Every state write SHALL write a temporary file and rename it over the target. A failed write SHALL leave the previous bytes intact and SHALL NOT leave a partial state file.

#### Scenario: A failed write keeps the previous state

- **WHEN** the temporary write or the rename fails
- **THEN** the previous state file still parses and the temporary file is removed

#### Scenario: A reader never sees a partial file

- **WHEN** a reader opens the state while a writer is working
- **THEN** it reads either the previous complete state or the new complete state

### Requirement: State names are safe path segments

The state file name and the change lock directory name SHALL use the review store's safe-segment rule for `store` and `change`: a value equal to `.` or `..`, or containing `/`, `\` or NUL, SHALL be refused before a path is built.

#### Scenario: A slash in a change name is refused

- **WHEN** `change` contains `/`
- **THEN** the plugin refuses the call before writing state or creating a lock

#### Scenario: A traversal segment is refused

- **WHEN** `store` or `change` is `.` or `..`
- **THEN** the plugin refuses the call before building a path

#### Scenario: A double dot inside a name is accepted

- **WHEN** `change` is `foo..bar`
- **THEN** the plugin accepts it; only the whole value `.` or `..` is refused

#### Scenario: A backslash or NUL is refused

- **WHEN** `store` or `change` contains `\` or NUL
- **THEN** the plugin refuses the call before building a path

### Requirement: The main root is resolved from git

`mainRoot` SHALL be the first `git worktree list --porcelain` entry's `worktree` path, or the current worktree's top level when the repository has one worktree. A linked worktree SHALL record the main checkout, not itself.

#### Scenario: A linked worktree records the main root

- **WHEN** state is written from a linked worktree
- **THEN** `mainRoot` names the main checkout, not the linked worktree

#### Scenario: The main worktree records itself

- **WHEN** state is written from the main worktree
- **THEN** `mainRoot` is that worktree's top level

### Requirement: The lifecycle lock is created atomically with its owner

The plugin SHALL create the lifecycle lock at `<git common dir>/openspec-flow/lifecycle.lock.d` by writing its owner record into a temporary directory and renaming that complete directory into the lock path. A failed rename SHALL leave no ownerless lock. A second acquisition SHALL wait for a bounded timeout, then fail naming the owner and directory.

#### Scenario: One holder at a time

- **WHEN** one process holds the lifecycle lock and another tries to acquire it
- **THEN** the second process waits and then fails with the owner pid and token

#### Scenario: No ownerless lock is published

- **WHEN** the process is interrupted before the rename
- **THEN** the lock path does not exist and the temporary directory is left for cleanup, not used as a lock

### Requirement: The change lock is scoped per change

The plugin SHALL create one change lock at `<git common dir>/openspec-flow/changes/<store>#<change>.lock.d` using the same atomic owner-directory creation. Acquiring a change lock SHALL NOT block a different change's lock. The same change's second acquisition SHALL wait for a bounded timeout and then fail naming the owner.

#### Scenario: Different changes acquire together

- **WHEN** two changes acquire their own change locks at the same time
- **THEN** both acquire without waiting

#### Scenario: The same change is serialized

- **WHEN** the same change tries to acquire its change lock twice
- **THEN** the second acquisition fails with the owner and lock directory

### Requirement: Locks are acquired in one fixed order

A caller that needs both locks SHALL acquire the lifecycle lock before the change lock and release the change lock before the lifecycle lock. A caller SHALL NOT acquire the lifecycle lock while holding a change lock.

#### Scenario: Lifecycle comes first

- **WHEN** a caller acquires both locks
- **THEN** the lifecycle lock is held before the change lock is requested

#### Scenario: Reverse order is refused

- **WHEN** a caller already holds a change lock and requests the lifecycle lock
- **THEN** the plugin refuses the request instead of deadlocking

### Requirement: Release removes only the caller's own lock

Releasing a lock SHALL remove the directory only when the owner token matches the caller's token. A mismatched token SHALL leave the directory and report the current owner. Releasing an already absent lock SHALL succeed. A timed-out waiter SHALL NOT delete a lock another owner acquired.

#### Scenario: The owner removes its lock

- **WHEN** the caller releases with the token it acquired
- **THEN** the lock directory is removed

#### Scenario: A changed owner is left in place

- **WHEN** the caller releases with a token that no longer matches the owner file
- **THEN** the lock remains and the result names the current owner

#### Scenario: A timed-out waiter deletes nothing

- **WHEN** a waiter times out and another process acquired the lock
- **THEN** the waiter's cleanup leaves that lock in place

### Requirement: Recovery deletes only a dead owner

`recover` SHALL accept a lock `scope` and an `expectedOwner` token. It SHALL re-read the owner under a recovery mutex, delete the lock only when the observed token still matches and its process is dead, and report the recovered scope. It SHALL refuse a live owner, a changed owner, or a missing owner, and SHALL NOT delete state, worktrees, branches or review records.

#### Scenario: A dead owner is recovered

- **WHEN** the caller passes the token of a dead lifecycle owner
- **THEN** the lock directory is removed and the result names the recovered scope

#### Scenario: A live owner is not recovered

- **WHEN** the recorded owner process is alive
- **THEN** recovery refuses and names the live owner

#### Scenario: Recovery does not touch worktree data

- **WHEN** recovery removes a lock
- **THEN** the worktree, branch, state file and review records are unchanged

### Requirement: Worktree inspection is read-only

`openspec_inspect` with `action: "worktree"` SHALL report the state file, the recorded worktree and branch, every lock's owner and liveness, and a doctor result with `status`, `state`, `locks`, `worktree` and `repair` fields. It SHALL NOT write. `repair.action` SHALL be `none`, `recover` with a scope and expected owner, or `manual` with a message when this change has no supported repair.

#### Scenario: Inspection writes nothing

- **WHEN** the action runs against a valid or missing state
- **THEN** the state file, locks and worktree are unchanged

#### Scenario: A missing worktree is a manual repair

- **WHEN** the state names a worktree path that no longer exists
- **THEN** the doctor result reports `repair.action: "manual"` and the path

#### Scenario: A corrupt state is a manual repair

- **WHEN** the state file is not valid JSON or misses a required field
- **THEN** the doctor result reports `state.valid: false`, the error and `repair.action: "manual"`

#### Scenario: A dead lock names recover

- **WHEN** a lock's owner pid is dead
- **THEN** the doctor result reports `repair.action: "recover"` with the scope and owner token

#### Scenario: The environment is not inspected

- **WHEN** the worktree has no dependency cache, profile or browser cache
- **THEN** inspection does not report those as problems
