# Spec Delta: review entry model

## MODIFIED Requirements

### Requirement: Land fast-forwards and archives in one critical section

Land SHALL fast-forward main to the worktree branch with `--ff-only`, verify the resulting tree equals the required tree, archive, commit the archive, write the landed manifest and mark the state `archived`, all before releasing the lifecycle lock. The required tree SHALL be a ready enabled `pipeline.beforeArchive` entry's `treeSha`, or the worktree head when that entry is disabled, unavailable or absent. An enabled but unready entry SHALL refuse. Land SHALL NOT push.

#### Scenario: A reviewed worktree lands

- **WHEN** the `beforeArchive` entry is ready and its tree matches the worktree head
- **THEN** main fast-forwards to the worktree head, the archive and archive commit complete, and the state becomes `archived`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables the `beforeArchive` entry or declares none
- **THEN** land verifies the resulting tree against the worktree head and proceeds

#### Scenario: Apply review is enabled but not ready

- **WHEN** the policy enables the `beforeArchive` entry and no ready review exists
- **THEN** land refuses before updating main

#### Scenario: The merged tree differs

- **WHEN** the tree after the fast-forward does not equal the required tree
- **THEN** land fails, does not archive, and does not reset or rewind main

#### Scenario: Land does not push

- **WHEN** land completes
- **THEN** no remote branch or remote main is updated

#### Scenario: A pr beforeArchive entry supplies the tree

- **WHEN** the policy names `pr` as `beforeArchive` and the `pr` review is ready with a matching tree
- **THEN** land uses the `pr` record and lands without an `apply` record

### Requirement: The landed manifest records the landed facts

A successful land SHALL write `<common>/openspec-flow/landed/<land>.json` with `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `landCommit`, `landMode` (`fast-forward` or `legacy-merge`), `mainHead`, `archiveCommit`, `beforeArchiveEntry` (entry name, null without a review), `applyReviewId`, `reviewRecordHash` (SHA-256 of that entry's record file, both null without a review), `approvedBy` and `landedAt`. It SHALL NOT write `mergeCommit`.

#### Scenario: The manifest is written once

- **WHEN** land completes
- **THEN** one manifest exists for the land commit and names the reviewed tree, pre-land main, archive commit and review entry

#### Scenario: A retry does not write a second manifest

- **WHEN** land resumes after a partial failure
- **THEN** it reuses the existing land commit and writes or updates only the same manifest

#### Scenario: A no-review manifest records null review fields

- **WHEN** land proceeds without a `beforeArchive` review
- **THEN** the manifest records `beforeArchiveEntry`, `applyReviewId` and `reviewRecordHash` as null

#### Scenario: A pr beforeArchive manifest names the pr record

- **WHEN** land proceeds with a ready `pr` entry as `beforeArchive`
- **THEN** the manifest records `beforeArchiveEntry: "pr"`, the `pr` record id and the hash of `pr-review.json`

### Requirement: Land records a rebase review marker

Land SHALL verify the change-lock owner, then write `rebaseReview` to the `apply` record only when `beforeArchive` is `apply`, ready, and the worktree is behind main. The marker SHALL carry `requiredAt`, `mainHead`, `worktreeHead` and `treeSha`. A disabled or absent entry SHALL refuse without writing it. Another `beforeArchive` entry behind main SHALL get no marker and a refusal naming `openspec_review action=resume review=<entry>`. A caller without the change lock SHALL NOT write the marker.

#### Scenario: A behind worktree writes the marker under the review lock

- **WHEN** the owning land call finds `beforeArchive` `apply` ready, the worktree behind main and that entry enabled
- **THEN** the apply record carries `rebaseReview` under the review-directory lock with the pre-rebase worktree head and reviewed tree

#### Scenario: A disabled review writes no marker

- **WHEN** the locked policy disables the `beforeArchive` entry and the worktree is behind main
- **THEN** land refuses and writes no `rebaseReview`

#### Scenario: A pr beforeArchive behind main writes no marker

- **WHEN** `beforeArchive` is `pr`, the `pr` review is ready and the worktree is behind main
- **THEN** land refuses and writes no `rebaseReview`
- **AND** it names `openspec_review action=resume review=pr` after rebase and retest, then asks to retry land

#### Scenario: A foreign lock owner writes nothing

- **WHEN** the change lock belongs to another live pid
- **THEN** land refuses before writing the marker

### Requirement: The landed manifest records the pre-clear review hash

When `beforeArchive` is `apply` and land clears `rebaseReview` after writing the manifest, `reviewRecordHash` SHALL be the SHA-256 of the `apply` record bytes `finishLand` read before the clear. A later manifest audit SHALL treat the value as the land-time record hash and SHALL NOT recompute it from the post-clear record.

#### Scenario: The hash is computed before the clear

- **WHEN** an extra round land writes the manifest and then clears the marker
- **THEN** `reviewRecordHash` equals the hash of the `beforeArchive` record bytes read by `finishLand`

#### Scenario: The audit uses the land-time record

- **WHEN** a manifest audit compares `reviewRecordHash`
- **THEN** it uses the land-time record hash and does not recompute it from the post-clear record

### Requirement: Legacy landed manifests remain readable

Readers of a landed manifest SHALL resolve its landed commit from `landCommit`, falling back to legacy `mergeCommit` when `landCommit` is absent. A manifest without `beforeArchiveEntry` SHALL read as the `apply` entry. A legacy manifest SHALL keep its existing `<merge>.json` path and SHALL NOT need rewriting.

#### Scenario: A legacy manifest is cleaned up

- **WHEN** an archived state has a manifest with only `mergeCommit`
- **THEN** the cleanup retry reads that manifest and reports its commit

#### Scenario: A legacy manifest needs no migration

- **WHEN** a landed manifest predates `landCommit`
- **THEN** readers resolve the same commit from `mergeCommit`

#### Scenario: A legacy manifest reads as the apply entry

- **WHEN** a landed manifest has no `beforeArchiveEntry`
- **THEN** readers treat `applyReviewId` and `reviewRecordHash` as the `apply` entry's facts
