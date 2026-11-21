# change-review delta

## MODIFIED Requirements

### Requirement: Land binds a ready apply review to the merged tree

When apply review is enabled and ready, its recorded tree SHALL equal the worktree `HEAD^{tree}` at land start. A ready extra round named by `rebaseReview` SHALL supply that tree while the marker is present. Land SHALL verify the feature head tree equals that tree before the fast-forward and the main tree equals it after the fast-forward, inside the same lifecycle critical section.

#### Scenario: Land verifies the reviewed tree

- **WHEN** land starts for a ready apply review
- **THEN** it checks the recorded tree against the worktree head and the main tree after the fast-forward

#### Scenario: A stale reviewed tree is refused

- **WHEN** the worktree head or the main tree after the fast-forward differs from the required tree
- **THEN** land refuses and does not archive

#### Scenario: Archive follows the tree check

- **WHEN** the main tree after the fast-forward matches
- **THEN** archive runs before the lifecycle lock is released

#### Scenario: A ready extra round owns the required tree

- **WHEN** `rebaseReview` is present and the latest extra round is ready
- **THEN** its `treeSha` is the required tree

### Requirement: Land without apply review verifies the worktree head

When the locked policy disables apply review or has no apply section, land SHALL verify the feature head tree before the fast-forward and the main tree after it against the worktree's current `HEAD^{tree}`. An enabled but unready review SHALL refuse before the fast-forward.

#### Scenario: A disabled review uses the worktree head

- **WHEN** the policy disables apply review or has no apply section
- **THEN** the worktree head is the required tree

#### Scenario: An enabled unready review is refused

- **WHEN** the policy enables apply review and no ready review exists
- **THEN** land refuses before the fast-forward

### Requirement: A ready extra round supplies the required land tree

While the marker is present, land SHALL require a ready extra round and SHALL use its `treeSha` as the required tree. Without a ready extra round, land SHALL refuse before the fast-forward and name `openspec_review action=resume review=apply`. The marker SHALL be cleared only after land binds that tree.

#### Scenario: Land uses the ready extra round tree

- **WHEN** the marker is present and the latest extra round is ready
- **THEN** land verifies the worktree head and main tree against that extra round's tree

#### Scenario: Land waits for an extra round

- **WHEN** the marker is present and no extra round is ready
- **THEN** land refuses before the fast-forward and names the resume step
