# apply-worktree delta

## RENAMED Requirements

- FROM: `### Requirement: Land merges and archives in one critical section`
- TO: `### Requirement: Land fast-forwards and archives in one critical section`

## MODIFIED Requirements

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

- **WHEN** the archive is written but its commit fails
- **THEN** the worktree and archive changes remain and a retry completes the commit

#### Scenario: The manifest write fails after the archive commit

- **WHEN** the archive commit succeeded but the manifest write failed
- **THEN** a retry detects the archive commit and writes only the manifest

### Requirement: The landed manifest records the landed facts

A successful land SHALL write `<common>/openspec-flow/landed/<land>.json` with `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `landCommit`, `landMode` (`fast-forward`), `mainHead` (the pre-land main commit), `archiveCommit`, `applyReviewId`, `reviewRecordHash` (SHA-256 of `apply-review.json`, both `null` when no review exists), `approvedBy` and `landedAt`. It SHALL NOT write `mergeCommit`.

#### Scenario: The manifest is written once

- **WHEN** land completes
- **THEN** one manifest exists for the land commit and names the reviewed tree, pre-land main and archive commit

#### Scenario: A retry does not write a second manifest

- **WHEN** land resumes after a partial failure
- **THEN** it reuses the existing land commit and writes or updates only the same manifest

#### Scenario: A no-review manifest records null review fields

- **WHEN** land proceeds without an apply review
- **THEN** the manifest records `applyReviewId` and `reviewRecordHash` as null

## ADDED Requirements

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
