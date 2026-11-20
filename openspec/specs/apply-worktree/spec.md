# apply-worktree Specification

## Purpose
Tracks the checkout and locks that let one change apply in its own worktree while other changes proceed, and provides a read-only inspection surface plus an explicit recovery action.

## Requirements

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

### Requirement: Land checks the main and worktree trees

`openspec_apply_worktree action=land` SHALL run in the main worktree after the handover under the lifecycle and fresh change locks and require main on `main`, clean main apart from other changes' uncommitted planning files, a clean worktree, a worktree containing the latest main, and an `active` or `landing` state naming that worktree and branch. A worktree behind main SHALL be refused with a rebase, retest and re-review instruction.

#### Scenario: Another change's planning file is uncommitted

- **WHEN** main has an uncommitted file under another change's directory
- **THEN** land proceeds

#### Scenario: The worktree is behind main

- **WHEN** the worktree does not contain the latest main
- **THEN** land refuses before merging

#### Scenario: A missing or foreign state is refused

- **WHEN** the change has no active or landing state or the state names another worktree
- **THEN** land refuses before merging

### Requirement: Land takes over the apply lock

Land SHALL verify the state `lockPid` is its own process and `lockToken` matches the live change lock, release that lock as the owner, set `status: landing`, acquire the lifecycle lock, then a fresh change lock, and record the fresh lock's token/pid in the state. A pid/token mismatch SHALL refuse; a dead owner SHALL use `recover`. A failure before the merge SHALL restore `status: active` and reacquire the change lock and token.

#### Scenario: The owner releases and land takes over

- **WHEN** land starts in the apply owner process and the token matches
- **THEN** it releases its own change lock, sets `landing`, acquires lifecycle and then a fresh change lock

#### Scenario: A mismatched owner is refused

- **WHEN** the pid or token does not match the live lock
- **THEN** land refuses without deleting the lock

#### Scenario: A dead owner uses recover

- **WHEN** the recorded owner pid is dead
- **THEN** land reports `openspec_apply_worktree action=recover`, then acquires the free lock and replaces the state token/pid

#### Scenario: A failed handover restores active

- **WHEN** the lifecycle or fresh change lock cannot be acquired
- **THEN** the state returns to `active` and no merge starts

### Requirement: Land merges and archives in one critical section

Land SHALL merge with `--no-ff`, verify the merged tree equals the required tree, archive, commit the archive, write the landed manifest and mark the state `archived`, all before releasing the lifecycle lock. The required tree SHALL be a ready enabled apply review's `treeSha`, or the worktree head when the locked policy disables apply review or has no apply section. An enabled but unready review SHALL refuse. Land SHALL NOT push.

#### Scenario: A reviewed worktree lands

- **WHEN** apply review is ready and its tree matches the worktree head
- **THEN** the merge, archive and archive commit complete and the state becomes `archived`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review or has no apply section
- **THEN** land verifies the merged tree against the worktree head and proceeds

#### Scenario: Apply review is enabled but not ready

- **WHEN** the policy enables apply review and no ready review exists
- **THEN** land refuses before merging

#### Scenario: The merged tree differs

- **WHEN** the merged tree does not equal the required tree
- **THEN** land aborts the merge, restores the pre-merge main and does not archive

#### Scenario: Land does not push

- **WHEN** land completes
- **THEN** no remote branch or remote main is updated

### Requirement: A failed land keeps a resumable state

A failed merge, archive, commit or manifest write SHALL keep the worktree, SHALL NOT claim a completed land and SHALL be retryable without merging twice or archiving twice. A completed merge SHALL be retained only after its merged-tree check passed.

#### Scenario: Archive fails after the merge

- **WHEN** the archive fails after a passed merged-tree check
- **THEN** the merge and worktree remain, no manifest exists and a retry resumes archive

#### Scenario: The archive commit fails

- **WHEN** the archive is written but its commit fails
- **THEN** the worktree and archive changes remain and a retry completes the commit

#### Scenario: The manifest write fails after the archive commit

- **WHEN** the archive commit succeeded but the manifest write failed
- **THEN** a retry detects the archive commit and writes only the manifest

### Requirement: The landed manifest records the landed facts

A successful land SHALL write `<common>/openspec-flow/landed/<merge>.json` with `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `mergeCommit`, `mainHead` (the pre-merge main commit), `archiveCommit`, `applyReviewId`, `reviewRecordHash` (SHA-256 of `apply-review.json`, both `null` when no review exists), `approvedBy` and `landedAt`.

#### Scenario: The manifest is written once

- **WHEN** land completes
- **THEN** one manifest exists for the merge and names the reviewed tree, pre-merge main and archive commit

#### Scenario: A retry does not write a second manifest

- **WHEN** land resumes after a partial failure
- **THEN** it reuses the existing merge and writes or updates only the same manifest

#### Scenario: A no-review manifest records null review fields

- **WHEN** land proceeds without an apply review
- **THEN** the manifest records `applyReviewId` and `reviewRecordHash` as null

### Requirement: Remove deletes only an archived plugin checkout

`openspec_apply_worktree action=remove` SHALL run in the main worktree under the lifecycle and the same change's lock. It SHALL delete only a state whose `worktree` is under `<mainRoot>/.cache/openspec-flow/worktrees/`, whose state is `archived` or explicitly abandoned with `approvedBy: "user"` and a reason. It SHALL keep the branch and refuse a PR worktree or a dirty checkout.

#### Scenario: An archived checkout is removed

- **WHEN** the state is `archived` and the checkout is clean
- **THEN** the checkout is removed and the branch is kept

#### Scenario: A PR worktree is never removed

- **WHEN** the state's worktree is outside the plugin worktree root
- **THEN** remove refuses

#### Scenario: An active checkout needs user approval

- **WHEN** the state is `active` and `abandon` lacks user approval or a reason
- **THEN** remove refuses
