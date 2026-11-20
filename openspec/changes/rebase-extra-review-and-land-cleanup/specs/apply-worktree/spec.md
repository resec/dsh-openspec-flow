# Spec Delta

## ADDED Requirements

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
