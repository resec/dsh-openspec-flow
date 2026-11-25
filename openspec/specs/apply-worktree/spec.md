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

`openspec_inspect` with `action: "worktree"` SHALL report the state file, the recorded worktree and branch, every lock's owner and liveness, and a doctor result with `status`, `state`, `locks`, `worktree` and `repair` fields. It SHALL NOT write. `repair.action` SHALL be `none`, `recover` with a scope and expected owner, `cleanup` when an archived state has pending cleanup, or `manual` with a message when this change has no supported repair.

#### Scenario: Inspection writes nothing

- **WHEN** the action runs against a valid or missing state
- **THEN** the state file, locks and worktree are unchanged

#### Scenario: A missing worktree is a manual repair

- **WHEN** the state names a worktree path that no longer exists and no cleanup removed it
- **THEN** the doctor result reports `repair.action: "manual"` and the path

#### Scenario: A cleaned archived state is healthy

- **WHEN** the state is `archived` and cleanup removed the worktree
- **THEN** the doctor result does not report a missing worktree and `repair.action` is `none`

#### Scenario: A pending cleanup names its retry

- **WHEN** the state is `archived` and cleanup did not finish
- **THEN** the doctor result reports `repair.action: "cleanup"`

#### Scenario: A legacy archived checkout is pending cleanup

- **WHEN** an archived state has no cleanup record and its worktree still exists
- **THEN** the doctor result reports `repair.action: "cleanup"`

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
- **THEN** it creates the worktree from the seal commit on the branch the seal created

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

Creation SHALL hold only the per-change change lock and inspect but not acquire a legacy project-wide apply lock. It SHALL ensure the worktree root is ignored through `.git/info/exclude`, create the worktree, move the changer session, then write the state with the lock token and pid. A failure SHALL restore the session to main, remove the worktree, delete only a branch this call created, remove any state it wrote and release the lock; a seal-created branch and its seal ref SHALL remain.

#### Scenario: The worktree root is locally ignored

- **WHEN** `.gitignore` does not ignore `.cache`
- **THEN** the plugin adds a worktree-relative root to `.git/info/exclude` and `git status` stays clean

#### Scenario: Creation moves the session before the state

- **WHEN** the worktree is created
- **THEN** the session moves first and the state is written with the lock token and pid

#### Scenario: A failed session move restores main

- **WHEN** the session move fails
- **THEN** the worktree and any state are removed
- **AND** a branch this call created is deleted while a seal-created branch and its seal ref remain
- **AND** the changers cwd is unchanged

#### Scenario: A legacy apply lock still blocks

- **WHEN** a legacy project-wide apply lock names another change
- **THEN** a git worktree apply is refused and names the holder

#### Scenario: Creation failure leaves no partial state

- **WHEN** worktree creation or the state write fails
- **THEN** the created worktree is removed, a branch this call created is deleted, the locks are released and no state is published

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

### Requirement: Land fast-forwards and archives in one critical section

Land SHALL fast-forward main to the worktree branch with `--ff-only`, verify the resulting tree equals the required tree, archive, commit the archive, write the landed manifest and mark the state `archived`, all before releasing the lifecycle lock. The required tree SHALL be a ready enabled apply review's `treeSha`, or the worktree head when the locked policy disables apply review or has no apply section. An enabled but unready review SHALL refuse. Land SHALL NOT push.

#### Scenario: A reviewed worktree lands

- **WHEN** apply review is ready and its tree matches the worktree head
- **THEN** main fast-forwards to the worktree head, the archive and archive commit complete, and the state becomes `archived`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review or has no apply section
- **THEN** land verifies the resulting tree against the worktree head and proceeds

#### Scenario: Apply review is enabled but not ready

- **WHEN** the policy enables apply review and no ready review exists
- **THEN** land refuses before updating main

#### Scenario: The merged tree differs

- **WHEN** the tree after the fast-forward does not equal the required tree
- **THEN** land fails, does not archive, and does not reset or rewind main

#### Scenario: Land does not push

- **WHEN** land completes
- **THEN** no remote branch or remote main is updated

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

### Requirement: The landed manifest records the landed facts

A successful land SHALL write `<common>/openspec-flow/landed/<land>.json` with `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `landCommit`, `landMode` (`fast-forward` for a new land, `legacy-merge` when a retry completes a pre-existing merge), `mainHead` (the pre-land main commit), `archiveCommit`, `applyReviewId`, `reviewRecordHash` (SHA-256 of `apply-review.json`, both `null` when no review exists), `approvedBy` and `landedAt`. It SHALL NOT write `mergeCommit`.

#### Scenario: The manifest is written once

- **WHEN** land completes
- **THEN** one manifest exists for the land commit and names the reviewed tree, pre-land main and archive commit

#### Scenario: A retry does not write a second manifest

- **WHEN** land resumes after a partial failure
- **THEN** it reuses the existing land commit and writes or updates only the same manifest

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

### Requirement: State records the land cleanup

State MAY carry a `cleanup` object with `worktreeRemoved`, `branchRemoved`, optional `at` and optional `error`. A state without it SHALL read as no cleanup. `cleanup` SHALL NOT weaken the rule that unknown fields are rejected. The `cleanup` write SHALL keep the `archived` state, the recorded worktree and branch and the landed manifest.

#### Scenario: Cleanup round-trips

- **WHEN** the plugin writes cleanup flags and an error and reads the state back
- **THEN** the cleanup object keeps its values

#### Scenario: A legacy state without cleanup parses

- **WHEN** a state file predates `cleanup`
- **THEN** the plugin reads it without an error and treats cleanup as absent

#### Scenario: An unknown field is still refused

- **WHEN** a state document carries a field outside the known set
- **THEN** the plugin rejects the document and names the field

### Requirement: Land records a rebase review marker

Land SHALL verify the change-lock owner, then write `rebaseReview` to the apply record under the review-directory lock when the apply review is ready and the worktree is behind main. The marker SHALL carry `requiredAt`, `mainHead`, `worktreeHead` and `treeSha` of the reviewed tree. With apply review disabled or absent, land SHALL refuse without writing it. A caller that does not own the change lock SHALL NOT write the marker.

#### Scenario: A behind worktree writes the marker under the review lock

- **WHEN** the owning land call finds the apply review ready, the worktree behind main and apply review enabled
- **THEN** the apply record carries `rebaseReview` with the pre-rebase worktree head and reviewed tree

#### Scenario: A disabled review writes no marker

- **WHEN** the locked policy disables apply review and the worktree is behind main
- **THEN** land refuses and writes no `rebaseReview`

#### Scenario: A foreign lock owner writes nothing

- **WHEN** the change lock belongs to another live pid
- **THEN** land refuses before writing the marker

### Requirement: A cleanup retry skips the land preconditions

A land call for an `archived` state with an existing manifest and incomplete cleanup SHALL skip the lock handover, worktree reads and clean or behind-main checks. It SHALL acquire the lifecycle lock and the change lock, run only the cleanup, keep `archived` and release the locks. It SHALL NOT merge, archive or write a second manifest.

#### Scenario: A retry cleans without merging again

- **WHEN** land runs for an archived state with a manifest and incomplete cleanup
- **THEN** it retries only the cleanup and does not merge, archive or write a second manifest

#### Scenario: A retry does not need the recorded worktree

- **WHEN** the cleanup already removed the worktree and the branch deletion failed
- **THEN** the retry runs without reading that worktree path and completes the branch flag

### Requirement: Land removes the landed worktree and branch

After a completed land, inside the lifecycle section, the plugin SHALL remove the plugin worktree and delete its local branch, keep the `archived` state and the landed manifest, and record `cleanup` on the state. A cleanup failure SHALL keep the archived state, record the error, and report `cleanup.complete: false` with `cleanup.error` in the land result without rolling back the merge, archive or manifest.

#### Scenario: A completed land removes its checkout

- **WHEN** land completes the merge, archive and manifest
- **THEN** the worktree directory and the local branch no longer exist, the state is `archived` and the manifest remains

#### Scenario: A cleanup failure reports incomplete cleanup

- **WHEN** removing the worktree or deleting the branch fails
- **THEN** land reports `cleanup.complete: false` with the error, keeps `archived`, the manifest and `cleanup.error`, and the merge stays landed

#### Scenario: An already removed checkout is idempotent

- **WHEN** the worktree or branch is already gone during a cleanup retry
- **THEN** the corresponding cleanup flag records success

#### Scenario: A PR worktree is untouched

- **WHEN** land cleans a plugin checkout
- **THEN** a user-created PR worktree and its branch are unchanged

### Requirement: Remove is idempotent after cleanup

`openspec_apply_worktree action=remove` SHALL succeed for an archived state whose cleanup already ran, without deleting the state and without failing when the checkout or the branch is already gone.

#### Scenario: A cleaned state keeps its record

- **WHEN** remove runs for an archived state whose cleanup removed the worktree
- **THEN** remove succeeds and the state file and manifest remain

#### Scenario: A missing checkout does not fail

- **WHEN** remove runs and the recorded checkout or branch is already gone
- **THEN** the call succeeds without removing the state

### Requirement: The landed manifest records the pre-clear review hash

When land clears `rebaseReview` after writing the manifest, `reviewRecordHash` SHALL be the SHA-256 of the record bytes `finishLand` read before the clear. A later manifest audit SHALL treat the value as the land-time record hash and SHALL NOT recompute it from the post-clear record.

#### Scenario: The hash is computed before the clear

- **WHEN** an extra round land writes the manifest and then clears the marker
- **THEN** `reviewRecordHash` equals the hash of the record bytes read by `finishLand`

#### Scenario: The audit uses the land-time record

- **WHEN** a manifest audit compares `reviewRecordHash`
- **THEN** it uses the land-time record hash and does not recompute it from the post-clear record

### Requirement: Land refuses a non-linear feature history

Land SHALL refuse a feature history whose `mainHead..featureHead` range contains a merge commit. The refusal SHALL name the linear rebase, retest and re-review correction, and SHALL happen before main is updated.

#### Scenario: The feature merged main

- **WHEN** the feature branch contains a merge commit after the pre-land main
- **THEN** land refuses before updating main and asks for a linear rebase

#### Scenario: A linear feature lands

- **WHEN** every commit in `mainHead..featureHead` has at most one parent
- **THEN** the linearity check passes and land continues

### Requirement: Land rechecks main under the lifecycle lock

After acquiring the lifecycle and fresh change lock, land SHALL re-read main and SHALL refuse when it differs from the precheck head. The refusal SHALL restore `status: active` and, when apply review is enabled, record the rebase marker for the new main. It SHALL make no fast-forward.

#### Scenario: Another change lands between the precheck and the lock

- **WHEN** main moves after the precheck and before the lock is acquired
- **THEN** land refuses, restores `active`, records the rebase marker when the review is enabled, and leaves main unchanged

#### Scenario: Main is unchanged under the lock

- **WHEN** main still equals the precheck head after both locks are held
- **THEN** land continues to the fast-forward

### Requirement: A moved main fails without discarding commits

After the lock-scoped recheck, a concurrent commit can still move main before the fast-forward. Land SHALL use a fast-forward-only update so that this fails without moving main. Land SHALL NOT reset, hard-checkout or otherwise rewind main, and the concurrent commit SHALL remain reachable. The failed call SHALL restore `status: active`; when apply review is enabled, it SHALL record the rebase marker for the new main.

#### Scenario: A seal commit wins the race

- **WHEN** main receives another commit after the recheck and before the fast-forward
- **THEN** the fast-forward fails, the new commit is preserved, the state returns to `active`, and the rebase marker is recorded

#### Scenario: No reset follows a failed tree check

- **WHEN** a tree check fails after main was fast-forwarded
- **THEN** land reports the failure without resetting main to the pre-land head

### Requirement: Land verifies both sides of the fast-forward

Land SHALL require the feature head tree to equal the required tree before updating main, and the main tree to equal the same tree after the fast-forward. A mismatch on either side SHALL fail, SHALL NOT archive and SHALL NOT reset main.

#### Scenario: The feature tree differs

- **WHEN** the worktree head tree differs from the required reviewed tree
- **THEN** land refuses before the fast-forward and main is unchanged

#### Scenario: The main tree differs

- **WHEN** main after the fast-forward does not carry the required tree
- **THEN** land refuses to archive and does not rewind main

### Requirement: Legacy landed manifests remain readable

Readers of a landed manifest SHALL resolve its landed commit from `landCommit`, falling back to legacy `mergeCommit` when `landCommit` is absent. A legacy manifest SHALL keep its existing `<merge>.json` path and SHALL NOT need rewriting.

#### Scenario: A legacy manifest is cleaned up

- **WHEN** an archived state has a manifest with only `mergeCommit`
- **THEN** the cleanup retry reads that manifest and reports its commit

#### Scenario: A legacy manifest needs no migration

- **WHEN** a landed manifest predates `landCommit`
- **THEN** readers resolve the same commit from `mergeCommit`

### Requirement: The seal creates the apply branch before the worktree

The seal stage SHALL create or reset the apply branch to the new seal commit when no worktree uses it, reuse the branch only when its tip equals the seal commit, and refuse with a recovery action when a worktree is attached. A failed creation SHALL keep the branch and the ref.

#### Scenario: The branch exists before the worktree

- **WHEN** the first apply seals a git worktree change
- **THEN** the apply branch points at the seal commit before the worktree exists

#### Scenario: A branch left by a removed checkout is reset

- **WHEN** a previous abandoned checkout left the branch behind and a fresh draft seals again
- **THEN** the branch is reset to the new seal commit

#### Scenario: An attached worktree refuses

- **WHEN** a worktree already uses the apply branch
- **THEN** the seal refuses and names the recovery action

#### Scenario: A failed creation keeps the seal

- **WHEN** worktree creation fails after the seal commit exists
- **THEN** the apply branch and the seal ref remain
- **AND** a later call reuses them without constructing a second seal

### Requirement: The seal ref uses the branch-safe name

The plugin SHALL create `refs/openspec-flow/seal/<slug>-<hash>` with the same slug and hash as the apply branch, never the raw state key, and SHALL delete it when land completes, when `openspec_apply_worktree action=remove` deletes an archived or explicitly abandoned checkout, and when an abandoned change is removed. A missing ref SHALL be tolerated. The ref SHALL NOT advance main, appear in `git branch`, or enter a normal push.

#### Scenario: The ref is created with the seal

- **WHEN** the first apply seals a git worktree change
- **THEN** `refs/openspec-flow/seal/<slug>-<hash>` points at the seal commit and main's `HEAD` is unchanged

#### Scenario: A double dot is safe in the ref

- **WHEN** the change is named `release..1`
- **THEN** the ref name uses the computed slug `release--1` and the seal succeeds

#### Scenario: A leading dot is safe in the ref

- **WHEN** a store id starts with `.` so the slug starts with `-`
- **THEN** the ref name is valid and the seal succeeds

#### Scenario: Land deletes the ref

- **WHEN** land completes the merge, archive and manifest
- **THEN** the seal ref no longer exists

#### Scenario: Remove deletes the ref

- **WHEN** `openspec_apply_worktree action=remove` deletes an archived or abandoned checkout
- **THEN** the seal ref no longer exists and a missing ref does not fail the call

### Requirement: Land reconciles the planning copy with the seal tree

Land SHALL reconcile the planning copy with the seal tree before its clean-main check and fast-forward: matching untracked files under the change directory and the plugin-written root `.gitignore` are removed, and a tracked root `.gitignore` that is modified or deleted is restored to its `HEAD` version so the fast-forward can update it.

#### Scenario: The matching copy is removed and the fast-forward proceeds

- **WHEN** the untracked files under the change directory match the seal tree and the other land checks pass
- **THEN** land removes them, the clean-main check passes and main fast-forwards

#### Scenario: The uncommitted ignore file is removed

- **WHEN** the plugin-written root `.gitignore` is untracked and matches the seal tree
- **THEN** land removes the working copy and the clean-main check passes

#### Scenario: A tracked ignore file is restored

- **WHEN** the root `.gitignore` is tracked and modified or deleted in main
- **THEN** land restores its `HEAD` version and the fast-forward updates it

#### Scenario: A failing check restores the removed copy

- **WHEN** land removed the untracked copy and a later check fails before main is updated
- **THEN** the removed files exist again as untracked files and the tracked ignore file keeps its pre-land bytes

### Requirement: Land refuses a planning copy that differs from the seal

A planning-copy file that differs from the seal tree or is not in it SHALL make land refuse and list the paths. Land SHALL NOT change any other tracked file.

#### Scenario: A modified copy refuses land

- **WHEN** an untracked file under the change directory or the plugin-written `.gitignore` differs from the seal tree or is not in it
- **THEN** land refuses and lists the differing paths without changing anything

#### Scenario: Other tracked files are left alone

- **WHEN** the change directory has files tracked by main and unmodified
- **THEN** land does not change them and the fast-forward updates them

#### Scenario: A tracked modified planning file refuses

- **WHEN** a file under the change directory is tracked by main and modified in the working tree
- **THEN** land refuses and names the path

### Requirement: Land restores the pre-land copy only when it touched it

A failure before main is updated SHALL restore the pre-land working copy, including removed untracked files and a restored tracked ignore file. A copy absent before land SHALL stay absent, and a copy already superseded by the merge SHALL NOT be restored.

#### Scenario: An absent copy is not recreated

- **WHEN** the untracked change directory or an untracked ignore file is already absent from main before land
- **THEN** land proceeds without recreating it

#### Scenario: A merged copy is not restored

- **WHEN** main already contains the change directory from the branch after a completed fast-forward
- **THEN** a retry does not restore the pre-land copy

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

### Requirement: Apply worktree creation prepares its toolchain record

Creating a git apply worktree SHALL run bootstrap's deps-only preparation in that worktree before creation publishes its state. A failed preparation SHALL follow the rollback in "Creation holds the change lock and publishes no partial state" and leave no state. Reusing an active worktree SHALL prepare only when its record is missing or stale.

#### Scenario: A new worktree gets a record

- **WHEN** a git apply worktree is created
- **THEN** deps-only preparation runs in it
- **AND** its record exists before the state is written

#### Scenario: A failed preparation rolls back

- **WHEN** the deps-only preparation fails
- **THEN** the created worktree is removed and a branch this call created is deleted
- **AND** no state is written
- **AND** the error names the failed preparation step

#### Scenario: A valid record is reused

- **WHEN** an active worktree is reused and its record is current
- **THEN** creation skips the preparation

#### Scenario: A stale record is prepared

- **WHEN** an active worktree is reused and its record is missing or stale
- **THEN** the preparation runs before the session continues

#### Scenario: A non-git project prepares nothing

- **WHEN** the project has no git worktree
- **THEN** no deps-only preparation runs
