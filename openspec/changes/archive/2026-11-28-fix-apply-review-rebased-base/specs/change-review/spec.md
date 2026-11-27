# Spec Delta

## ADDED Requirements

### Requirement: Apply review re-bases a draft diff onto the current fork

When a draft-baseline round resolves its base and the seal commit's parent is an ancestor of the current fork (`git merge-base HEAD origin/main`) but not the fork itself, the plugin SHALL use the fork as the base commit and a base tree that equals the fork tree overlaid with the paths the seal commit changed. It SHALL record the source as `rebase` and the seal commit as `rebasedFrom`. Otherwise the seal commit SHALL stay the base.

#### Scenario: The branch is rebased onto newer main

- **WHEN** a draft-baseline round starts or resumes and the seal commit's parent is an ancestor of the current fork but not the fork
- **THEN** the base commit is the fork and the base tree is the fork tree overlaid with the paths the seal commit changed
- **AND** the source is `rebase` and `rebasedFrom` is the seal commit

#### Scenario: Main is merged into the branch

- **WHEN** the branch gained the newer main through a merge commit instead of a rebase
- **THEN** the same re-based base tree and `rebase` source are recorded

#### Scenario: Main advanced without entering the branch

- **WHEN** the seal commit's parent equals the current fork
- **THEN** the seal commit stays the base and the source stays `seal`

#### Scenario: The fork cannot be resolved

- **WHEN** `git merge-base HEAD origin/main` cannot be resolved
- **THEN** the seal commit stays the base and no rebase is recorded

#### Scenario: The overlay tree cannot be built

- **WHEN** the overlaid base tree cannot be written with a temporary index, or it differs from the fork tree on a path the seal commit did not change
- **THEN** the round fails and asks for an explicit `base`

#### Scenario: An explicit base stays authoritative

- **WHEN** the round receives a non-empty `base`
- **THEN** that base is used and no re-base happens

### Requirement: A no-draft apply review re-bases an automatic base

When a no-draft round resolves its base without an explicit `base` and the recorded base source is `merge-base`, the plugin SHALL use the current fork as the base commit and its tree as the base tree when the recorded base commit is an ancestor of the fork but not the fork itself, record the source as `merge-base`, and record the recorded base as `rebasedFrom`. A recorded base with source `explicit`, or one that is not an ancestor of the fork, SHALL stay authoritative.

#### Scenario: The automatic recorded base is behind the fork

- **WHEN** a no-draft round starts or resumes without an explicit `base`, the recorded source is `merge-base`, and the recorded base commit is an ancestor of the fork but not the fork
- **THEN** the base commit is the fork, the base tree is the fork tree and the source is `merge-base`
- **AND** the recorded base is stored as `rebasedFrom`

#### Scenario: The recorded base equals the fork

- **WHEN** the recorded base commit equals the fork
- **THEN** the recorded base and its source stay unchanged

#### Scenario: The recorded base is explicit

- **WHEN** the recorded base source is `explicit` and the recorded base commit is an ancestor of the fork
- **THEN** the recorded base stays authoritative
- **AND** the round proceeds without a re-base until the caller passes `base` again

#### Scenario: The recorded base is not an ancestor

- **WHEN** the recorded base commit is not an ancestor of the fork
- **THEN** the recorded base stays authoritative and no re-base happens

## MODIFIED Requirements

### Requirement: The recorded apply base survives a rebase

A rebase SHALL replay the branch's seal commit and rewrite it. The plugin SHALL keep the recorded apply base commit reachable through its seal ref, and SHALL NOT record a base commit that no ref keeps reachable. When the branch took in newer main, the round SHALL derive the re-based fork tree again, diff from it, and keep the recorded base as `rebasedFrom`.

#### Scenario: Rebase rewrites the branch seal

- **WHEN** the worktree branch is rebased onto a newer main
- **THEN** the branch's first commit is a rewritten seal commit
- **AND** the recorded base commit is still reachable from the seal ref

#### Scenario: Apply review diffs the recorded base

- **WHEN** an apply review round runs and the seal commit's parent still equals the current fork
- **THEN** its diff starts at the recorded base tree
- **AND** no `rebasedFrom` is recorded

#### Scenario: Apply review diffs the re-based tree

- **WHEN** an apply review round runs after the branch took in newer main
- **THEN** its diff starts at the re-based fork tree
- **AND** the recorded base is stored as `rebasedFrom`

### Requirement: Apply review brief names the base reference and its source

The apply review brief SHALL name the base reference and identify its source as the seal commit recorded by the first `openspec_apply_next`, an explicit base passed to the round, `git merge-base HEAD origin/main`, or the current fork after the branch took in newer main.

#### Scenario: The base is the seal commit

- **WHEN** the apply review starts after a git seal
- **THEN** the brief names the seal commit as the base reference
- **AND** the brief identifies the source as the seal commit

#### Scenario: The base is explicit

- **WHEN** the apply review uses an explicit base
- **THEN** the brief names the explicit base as the base reference and identifies the source as explicit, not a seal commit

#### Scenario: The base is the merge base

- **WHEN** the apply review falls back to `git merge-base HEAD origin/main`
- **THEN** the brief names the merge base as the base reference and identifies the source as merge-base, not a seal commit

#### Scenario: The base is the re-based fork

- **WHEN** the round re-bases its diff origin after the branch took in newer main
- **THEN** the brief names the current fork as the base reference
- **AND** the brief states the branch was rebased or merged onto newer main and names the original base as `rebasedFrom`

### Requirement: Apply review uses the draft base and report lifecycle

A tree entry SHALL reuse the directory entry's report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, a matching `treeSha`, and every drift file waived. Its default draft baseline SHALL be the record of the `pipeline.beforeApply` entry. While `rebaseReview` is present, the matching tree SHALL be the latest extra round's tree.

#### Scenario: Apply review passes

- **WHEN** the latest tree report passes, no blocker is open, the tree matches and every drift file is waived
- **THEN** the tree entry is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an unresolved finding at or above `passCriteria`
- **THEN** the entry is not ready and its gate refuses the lifecycle step

#### Scenario: Apply review starts from the seal commit

- **WHEN** the first tree round opens after a git seal and no explicit base is passed
- **THEN** its base is the beforeApply entry's apply base commit, or the current fork when the branch already took in newer main
- **AND** the diff covers the implementation and any plan change after the seal

#### Scenario: A pr entry uses the beforeApply baseline

- **WHEN** a `pr` tree entry starts without `baseline` and the `beforeApply` entry has a ready record
- **THEN** the `pr` entry records the draft baseline and reads that record

#### Scenario: An extra round owns the ready tree

- **WHEN** the marker is present and the latest extra round passes
- **THEN** readiness compares the tree against that extra round's `treeSha`
