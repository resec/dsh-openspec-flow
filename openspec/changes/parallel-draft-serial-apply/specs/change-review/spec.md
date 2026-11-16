# change-review Delta

## MODIFIED Requirements

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the seal commit as the apply base commit in the draft review record. The seal commit SHALL change at least one file inside the change directory, SHALL change no file outside the change directory except the change's OpenSpec root `.gitignore` and other `openspec/changes/**` paths, and its change artifacts SHALL match the draft record. It SHALL omit the base when the project has no git or the change is store-backed outside the project root.

#### Scenario: Git project records the base

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git project and the seal commit is present
- **THEN** the review record gains that commit as the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** the review record has no apply base and apply review remains unavailable

#### Scenario: Another change's committed artifacts are accepted

- **WHEN** `HEAD` changes the change directory and also files under another `openspec/changes/**` path
- **THEN** the seal check proceeds and records the base

### Requirement: Git projects seal the draft before apply

In a git repository, the first `openspec_apply_next` after a ready draft review SHALL require a clean working tree, a `HEAD` that changes at least one file under the change directory and no file outside it except the change's OpenSpec root `.gitignore` and other `openspec/changes/**` paths, and change artifacts matching the draft record hash. Uncommitted paths under other `openspec/changes/**` directories SHALL NOT count as a dirty tree. The path comparison SHALL use worktree-relative paths. It SHALL record `HEAD` as the apply base commit. A project without git SHALL skip these checks. A store-backed change outside the project root SHALL skip these checks and record a warning.

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

### Requirement: Apply review object is the committed git tree

The apply review SHALL bind the git tree of the current `HEAD` commit. It SHALL require a git repository, a resolved commit and a working tree that is clean except for uncommitted paths under other `openspec/changes/**` directories. A project without git SHALL NOT offer apply review. Any other working-tree change after start SHALL invalidate the review, and a tree change SHALL invalidate it.

#### Scenario: Apply review starts on a clean commit

- **WHEN** a change has a clean working tree and a commit
- **THEN** the apply review records the commit and tree hashes
- **AND** the base is the draft review's base commit or `git merge-base HEAD origin/main`

#### Scenario: Working tree is dirty

- **WHEN** an apply review starts with uncommitted changes outside other `openspec/changes/**` directories
- **THEN** the start fails and asks for a commit

#### Scenario: Another change's uncommitted artifacts are allowed

- **WHEN** an apply review starts while only other `openspec/changes/**` directories have uncommitted files
- **THEN** the start proceeds and records the tree

#### Scenario: Project has no git

- **WHEN** apply review is requested outside a git repository
- **THEN** the start fails and reports that apply review is unavailable

#### Scenario: Tree changes after start

- **WHEN** `HEAD` resolves to another tree than the one recorded
- **THEN** the review is not ready and the gate refuses archive

## ADDED Requirements

### Requirement: Draft reviews run concurrently across changes

The plugin SHALL scope every draft review operation to one change. Starting, resuming, reporting, waiting for or disposing one change's draft review SHALL NOT be refused or altered by another change's draft review. Draft records, reviewer slots and wait deadlines SHALL remain independent per change, and a project MAY hold several draft reviews at the same time.

#### Scenario: Two changes start draft reviews

- **WHEN** two changes each call `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** both records are written under their own review directories and both reports return `in-review`

#### Scenario: A report stays with its change

- **WHEN** the first change submits a self-report while the second change is in a draft round
- **THEN** only the first change's record advances and the second change's readiness is unchanged

#### Scenario: A ready draft does not block another draft

- **WHEN** the first change's draft review is ready and the second change resumes its own draft review
- **THEN** the second resume opens its next round without waiting for the first change

#### Scenario: Independent reviewers run side by side

- **WHEN** two changes with `reviewers: 1` start draft reviews
- **THEN** each change records its own reviewer slot and child session
- **AND** each submission updates only the change named in the reviewer call

### Requirement: One change holds its apply locks

The plugin SHALL keep apply locks. An implementation-domain lock SHALL be identified by the review key `<store>#<change>`. A store-domain lock SHALL also record the implementation root, so a second project is refused while the same root may re-enter. Every apply entry SHALL acquire every required lock; a lock naming a different identity SHALL refuse the call and name the holder and path. Draft review SHALL remain available.

#### Scenario: First ready change takes its locks

- **WHEN** a change whose draft review is ready calls `openspec_apply_next`
- **THEN** every lock it requires names that change and store, and records its change root, implementation root and start time

#### Scenario: A store change from another project is refused

- **WHEN** a store change is applied from a second project while the store lock records the first project
- **THEN** the call fails because the implementation roots differ

#### Scenario: Same name in another store is refused

- **WHEN** a change with the same name but a different store calls `openspec_apply_next` while the lock names the first
- **THEN** the call fails because the review keys differ

#### Scenario: Second change is refused on apply

- **WHEN** a change whose draft review is ready calls `openspec_apply_next` while the lock names a different review key
- **THEN** the call fails, the apply state is unchanged and the error names the holder

#### Scenario: Second change is refused on apply review

- **WHEN** a change calls `openspec_review` with `action: "start"` or `"resume"` and `review: "apply"` while the lock names a different review key
- **THEN** the call fails and names the holder

#### Scenario: Draft review continues while the lock is held

- **WHEN** a second change starts or resumes its own draft review while the lock names the first change
- **THEN** the draft review proceeds

#### Scenario: Failed seal releases new locks

- **WHEN** the seal check fails after this call acquired one or more locks
- **THEN** every lock acquired by this call is released and a later change can acquire them

#### Scenario: The same change re-enters apply

- **WHEN** `openspec_apply_next` or an apply review entry runs again from the same implementation root for the lock's review key
- **THEN** the call proceeds

### Requirement: The apply lock covers every apply entry

The lock SHALL be enforced regardless of git, store selection, the draft switch or a policy. It SHALL record a schema version, the change, store, change root, implementation root and start time.

#### Scenario: A draft-disabled change takes the lock

- **WHEN** a change whose policy disables draft review calls `openspec_apply_next`
- **THEN** it acquires the lock before apply proceeds

#### Scenario: A non-git project serializes apply

- **WHEN** a second change in a project without git calls `openspec_apply_next` while the lock names the first change
- **THEN** the second call fails and names the holder

### Requirement: The apply lock covers the implementation and store domains

Every change SHALL acquire the lock of its implementation domain: the session's git worktree root, else the nearest OpenSpec root at or above the session working directory, else the change's resolved root. A store-backed change SHALL also acquire the lock of its store domain. A git domain SHALL use its worktree git directory; any other domain SHALL use `openspec/.review/`.

#### Scenario: A store change and a local change share one project lock

- **WHEN** a store change and a local change in one project both call an apply entry
- **THEN** only one proceeds, because they share the implementation domain

#### Scenario: Two store changes from different stores serialize in one project

- **WHEN** two store changes from different stores are applied from one project
- **THEN** both use the project implementation lock and only one proceeds

#### Scenario: A store-backed change takes the store domain lock

- **WHEN** one store change is applied from two projects
- **THEN** both sessions also use the store domain's lock and only one proceeds

#### Scenario: Nested roots share one worktree lock

- **WHEN** two changes live under different OpenSpec roots inside one git worktree
- **THEN** both apply entries use the same implementation lock file

#### Scenario: Linked worktrees take separate locks

- **WHEN** two linked worktrees of one repository apply changes
- **THEN** each worktree uses its own git-directory lock and both may proceed

#### Scenario: Git domain lock leaves the tree clean

- **WHEN** a change inside a git worktree acquires its implementation lock
- **THEN** `git status --porcelain` reports no new path

#### Scenario: A session outside every root falls back

- **WHEN** a change is applied from a directory with no OpenSpec root above it and no git worktree
- **THEN** its implementation lock is written under the change's resolved root

### Requirement: Another change's uncommitted planning files do not block the lock holder

While a change holds its apply locks, the seal, apply review and archive clean-tree checks SHALL ignore uncommitted paths that fall under any `openspec/changes/` directory other than the reviewed change's own directory, matched on git worktree-relative paths. A path under the reviewed change's directory, or one that does not fall under an `openspec/changes/` directory, SHALL still count as dirty. A seal commit SHALL NOT contain those uncommitted paths unless the user stages them.

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

- **WHEN** the working tree has an uncommitted path that is not under an `openspec/changes/` directory
- **THEN** the seal, apply review and archive still refuse

### Requirement: Archive completes the serial segment

`openspec_archive` SHALL refuse to archive a change while any present apply lock names a different identity. It SHALL proceed when no lock names another identity, and a successful archive SHALL release every lock that names the archived change; a failed archive SHALL keep them.

#### Scenario: Archive with no lock proceeds

- **WHEN** no apply lock names another identity and the change is otherwise ready to archive
- **THEN** `openspec_archive` proceeds and writes no lock

#### Scenario: Archive releases its locks

- **WHEN** `openspec_archive` archives the change named by both locks
- **THEN** both lock files are removed after the archive succeeds

#### Scenario: Archive with one lock present proceeds

- **WHEN** only one of the change's locks is present and it names the change
- **THEN** `openspec_archive` proceeds and releases that lock

#### Scenario: Failed archive keeps the locks

- **WHEN** `openspec_archive` fails for the change named by the locks
- **THEN** the locks remain

#### Scenario: Archive of another change is refused

- **WHEN** `openspec_archive` runs for a change that any present lock names differently
- **THEN** the call fails and no file moves

### Requirement: A stale or paused lock can be released

A lock SHALL be stale when its recorded change root no longer exists, or when its recorded implementation root no longer exists. A user MAY release a paused change's locks by removing every file named in the refusal; the agent SHALL ask the user and SHALL NOT remove it.

#### Scenario: A vanished implementation project is stale

- **WHEN** a store lock records an implementation root that no longer exists
- **THEN** the next project may replace the stale store lock

#### Scenario: Stale lock is replaceable

- **WHEN** a lock records a change root that no longer exists
- **THEN** the next change may acquire it and replace the stale record

#### Scenario: Manual release is a user action

- **WHEN** the user removes every lock file named in the refusal for a paused change
- **THEN** the next apply entry acquires fresh locks
- **AND** the lock refusal tells the agent to ask the user instead of removing the files
