# change-review delta

## MODIFIED Requirements

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the seal commit as the apply base commit. The commit SHALL change at least one file inside the change directory and nothing outside it except the change's OpenSpec root `.gitignore` and other `openspec/changes/**` paths, and its change artifacts SHALL match the draft record. No base is recorded without git or for a store-backed change outside the project root.

#### Scenario: Git project records the base

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git project without the apply worktree and the seal commit is present
- **THEN** the review record gains that commit as the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** the review record has no apply base and apply review remains unavailable

#### Scenario: Another change's committed artifacts are accepted

- **WHEN** `HEAD` changes the change directory and also files under another `openspec/changes/**` path
- **THEN** the seal check proceeds and records the base

### Requirement: Git projects seal the draft before apply

Without the apply worktree, a git project's first `openspec_apply_next` SHALL require a clean tree, a `HEAD` that changes only the change directory, the root `.gitignore` and other `openspec/changes/**` paths, and matching artifacts. It SHALL record `HEAD` as the apply base. Other changes' uncommitted files are ignored; paths compare worktree-relative. A git worktree apply seals on the branch instead. Without git or an outside-root store change, the checks are skipped; the store change warns.

#### Scenario: Seal commit is accepted

- **WHEN** the working tree is clean apart from other change directories, `HEAD` changes only files under the change directory, the root's `.gitignore` or another `openspec/changes/**` path, and the artifact hash matches the draft record
- **THEN** `openspec_apply_next` proceeds and records `HEAD` as the apply base commit

#### Scenario: Nested root seal is accepted

- **WHEN** the change lives under a nested OpenSpec root and `HEAD` changes only that root's change directory and `.gitignore`
- **THEN** the worktree-relative comparison accepts the seal

#### Scenario: Dirty working tree is refused

- **WHEN** the change directory or a file outside `openspec/changes/` has uncommitted changes
- **THEN** `openspec_apply_next` fails and asks for a commit before the seal

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain
- **THEN** the dirty-tree check passes and the seal proceeds

#### Scenario: Mixed commit is refused

- **WHEN** `HEAD` also changes a file outside the change directory, the root's `.gitignore` and `openspec/changes/`
- **THEN** `openspec_apply_next` fails and asks for a commit that contains only OpenSpec change paths

#### Scenario: Seal commit without a change-directory file is refused

- **WHEN** `HEAD` changes no file or changes only the root's `.gitignore`
- **THEN** `openspec_apply_next` fails and asks for a commit that contains the change directory

#### Scenario: Artifacts differ from the draft after sealing

- **WHEN** the change artifacts hash differs from the draft record hash
- **THEN** `openspec_apply_next` fails and asks for a resumed draft review or the reviewed version

#### Scenario: Project without git skips the seal

- **WHEN** the project has no git repository
- **THEN** the seal checks do not run and no apply base is recorded

#### Scenario: Store-backed change skips the seal

- **WHEN** the change belongs to a registered store whose change directory is outside the project root
- **THEN** the seal checks are skipped and the result carries a warning

### Requirement: Another change's uncommitted planning files do not block the lock holder

While a change holds its apply locks, the seal, apply review and archive checks SHALL ignore uncommitted paths under other `openspec/changes/` directories, on worktree-relative paths. The git worktree seal SHALL also ignore the reviewed change's own directory and the plugin-written ignore file. Every other path, including the reviewed change's own directory for the worktree-disabled seal, apply review and archive, SHALL count as dirty.

#### Scenario: Another draft's edits do not block the seal

- **WHEN** a second change has uncommitted artifact edits and the first change seals
- **THEN** the seal proceeds and commits only the first change's files

#### Scenario: Another root's draft edits do not block

- **WHEN** a parallel draft under a nested OpenSpec root has uncommitted edits and the holder seals, reviews or archives
- **THEN** the clean-tree check passes

#### Scenario: Another draft's edits do not block the apply review

- **WHEN** a second change has uncommitted artifact edits and the first change starts its apply review
- **THEN** the clean-tree check passes and the review opens

#### Scenario: Another draft's edits do not block archive

- **WHEN** a second change has uncommitted artifact edits and the first change archives
- **THEN** archive proceeds

#### Scenario: Code changes still block

- **WHEN** the working tree has an uncommitted code path outside `openspec/changes/` and other than the plugin-written ignore file
- **THEN** the seal, apply review and archive still refuse

#### Scenario: The git worktree seal accepts its own copy

- **WHEN** a git worktree apply seals with the change directory and the plugin-written ignore file uncommitted
- **THEN** the clean-tree check passes

#### Scenario: The worktree-disabled seal refuses its own copy

- **WHEN** the worktree is disabled and the change directory is uncommitted before the seal
- **THEN** the seal refuses and asks for a commit

### Requirement: Land tolerates another change's planning files

The land clean-main check SHALL ignore uncommitted paths under other `openspec/changes/` directories. Before the check it SHALL reconcile the landed change's plugin-owned planning copy: matching untracked files under its directory and the plugin-written root `.gitignore` are removed, and a tracked modified or deleted `.gitignore` is restored to its `HEAD` version. Any other uncommitted file inside the landed change, or a code path, SHALL refuse.

#### Scenario: A parallel draft's planning file is uncommitted

- **WHEN** main has an uncommitted file under another change's directory
- **THEN** land proceeds

#### Scenario: The landed change is dirty

- **WHEN** main has an uncommitted file inside the landed change's directory that differs from the seal tree or is not in it
- **THEN** land refuses

#### Scenario: The matching planning copy is reconciled

- **WHEN** the untracked change directory and an untracked plugin-written ignore file match the seal tree
- **THEN** land removes them and the clean-main check passes

#### Scenario: A tracked modified change-directory file refuses

- **WHEN** main has an uncommitted tracked modification inside the landed change's directory
- **THEN** land refuses and names the path

#### Scenario: A tracked ignore file is restored

- **WHEN** the plugin-written `.gitignore` is tracked and modified or deleted in main
- **THEN** land restores its `HEAD` version before the clean-main check

## ADDED Requirements

### Requirement: A git worktree apply seals on the apply branch

In a git worktree apply, the first `openspec_apply_next` after a ready draft review SHALL construct the seal commit with a temporary index from the change directory and the plugin-written uncommitted root `.gitignore`, attach it to the apply branch and the seal ref, and record it as the apply base, leaving `main`'s `HEAD`, index and working tree unchanged. The working tree SHALL be clean apart from the change directory, other changes' directories and that ignore file.

#### Scenario: The seal is constructed

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git worktree apply and the working tree matches the draft
- **THEN** the review record gains the constructed commit as the apply base
- **AND** the change directory stays uncommitted in main
- **AND** main's `HEAD`, index and working tree are unchanged

#### Scenario: The constructed commit changes only the planning paths

- **WHEN** the construction stages the change directory and the plugin-written ignore file
- **THEN** the commit changes at least one file under the change directory
- **AND** it changes no path outside the change directory and that ignore file

#### Scenario: The constructed artifacts match the draft

- **WHEN** the constructed commit's change artifacts are hashed
- **THEN** the hash equals the draft record's artifact hash

#### Scenario: The uncommitted ignore file is accepted

- **WHEN** the plugin wrote `openspec/.gitignore` and it is uncommitted
- **THEN** the clean-tree check accepts it and the construction stages it

#### Scenario: A dirty path outside the allowed set is refused

- **WHEN** a file outside the change directory, other `openspec/changes/**` directories and the plugin-written ignore file has uncommitted changes
- **THEN** `openspec_apply_next` fails and asks for a clean working tree

#### Scenario: Artifact mismatch leaves no seal

- **WHEN** the constructed commit's artifact hash differs from the draft record
- **THEN** `openspec_apply_next` fails, records no base and leaves no seal ref or branch

### Requirement: The recorded apply base survives a rebase

A rebase SHALL replay the branch's seal commit and rewrite it. The plugin SHALL keep the recorded apply base reachable through its seal ref so apply review can still diff the base tree against the branch head, and SHALL NOT record a base that no ref keeps reachable.

#### Scenario: Rebase rewrites the branch seal

- **WHEN** the worktree branch is rebased onto a newer main
- **THEN** the branch's first commit is a rewritten seal commit
- **AND** the recorded base commit is still reachable from the seal ref

#### Scenario: Apply review diffs the recorded base

- **WHEN** an apply review round runs after the rebase
- **THEN** its diff starts at the recorded base tree and covers the implementation after it
