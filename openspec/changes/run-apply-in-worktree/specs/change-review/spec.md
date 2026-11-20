# Spec Delta

## MODIFIED Requirements

### Requirement: One change holds its apply locks

A git worktree apply SHALL keep the per-change change lock for its implementation domain and SHALL also keep the store-domain apply lock for a store-backed change. Other paths SHALL keep the project apply locks. Locks SHALL name the review key; a store lock SHALL record the implementation root so a second project is refused. Every apply entry SHALL acquire the applicable lock; a foreign lock SHALL refuse and name the holder and path. Draft review SHALL remain available.

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

The applicable lock SHALL be enforced regardless of git, store selection, the draft switch or a policy. Git worktree apply SHALL use the per-change change lock and keep the store-domain lock when selected; compatibility and non-git paths SHALL use the project lock. A project lock SHALL record a schema version, the change, store, change root, implementation root and start time.

#### Scenario: A draft-disabled change takes the lock

- **WHEN** a change whose policy disables draft review calls `openspec_apply_next`
- **THEN** it acquires the lock before apply proceeds

#### Scenario: A non-git project serializes apply

- **WHEN** a second change in a project without git calls `openspec_apply_next` while the lock names the first change
- **THEN** the second call fails and names the holder

### Requirement: The apply lock covers the implementation and store domains

A git worktree apply SHALL use the per-change change lock instead of the implementation-domain project lock, and a store-backed change SHALL also acquire the store domain. Other paths SHALL acquire the implementation-domain project lock: the session's git worktree root, else the nearest OpenSpec root at or above the session working directory, else the change's resolved root. A git domain SHALL use its worktree git directory; any other domain SHALL use `openspec/.review/`.

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
