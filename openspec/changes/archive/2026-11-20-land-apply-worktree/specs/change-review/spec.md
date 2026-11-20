# Spec Delta

## ADDED Requirements

### Requirement: Land binds a ready apply review to the merged tree

When apply review is enabled and ready, its recorded tree SHALL equal the worktree `HEAD^{tree}` at land start. Land SHALL verify the `--no-ff` merged tree still equals that tree before archiving, inside the same lifecycle critical section.

#### Scenario: Land verifies the reviewed tree

- **WHEN** land starts for a ready apply review
- **THEN** it checks the recorded tree against the worktree head and the merged tree

#### Scenario: A stale reviewed tree is refused

- **WHEN** the worktree head or the merged tree differs from the required tree
- **THEN** land refuses and does not archive

#### Scenario: Archive follows the tree check

- **WHEN** the merged tree matches
- **THEN** archive runs before the lifecycle lock is released

### Requirement: Land without apply review verifies the worktree head

When the locked policy disables apply review or has no apply section, land SHALL verify the merged tree against the worktree's current `HEAD^{tree}`. An enabled but unready review SHALL refuse before merging.

#### Scenario: A disabled review uses the worktree head

- **WHEN** the policy disables apply review or has no apply section
- **THEN** the worktree head is the required tree

#### Scenario: An enabled unready review is refused

- **WHEN** the policy enables apply review and no ready review exists
- **THEN** land refuses before merging

### Requirement: Archive takes the lifecycle lock

In a git project, `openspec_archive` SHALL acquire the lifecycle lock on the main worktree before it checks the apply review or moves the change, and SHALL release it after the archive completes or fails. This serializes a main-worktree archive with land, remove and worktree creation. A project without git SHALL proceed without the lifecycle lock.

#### Scenario: Archive waits for land

- **WHEN** land holds the lifecycle lock
- **THEN** `openspec_archive` waits and does not move the change

#### Scenario: Land waits for archive

- **WHEN** `openspec_archive` holds the lifecycle lock
- **THEN** land does not start its merge

#### Scenario: A non-git archive proceeds

- **WHEN** the project has no git repository
- **THEN** `openspec_archive` proceeds without the lifecycle lock

### Requirement: Land tolerates another change's planning files

The land clean-main check SHALL ignore uncommitted paths under any `openspec/changes/` directory other than the landed change's own directory, matching the existing seal and archive clean-tree rule. It SHALL NOT ignore an uncommitted file outside those directories or inside the landed change.

#### Scenario: A parallel draft's planning file is uncommitted

- **WHEN** main has an uncommitted file under another change's directory
- **THEN** land proceeds

#### Scenario: The landed change is dirty

- **WHEN** main has an uncommitted file inside the landed change's directory
- **THEN** land refuses
