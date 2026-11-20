# Spec Delta

## ADDED Requirements


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
