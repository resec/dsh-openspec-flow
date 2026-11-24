## MODIFIED Requirements

### Requirement: Label-authorized pull-request landing

When the `mergeable` label is present and the final apply review is ready, the landing command SHALL merge with `gh pr merge --rebase` and the session SHALL archive on main after the merge only when the merged tree equals the reviewed tree. Neither SHALL add or remove `mergeable`, modify the contributor branch, squash, create a merge commit or force. The session MAY add or remove the advisory `owner-review` label.

#### Scenario: The label authorizes landing

- **WHEN** a reviewed pull request carries the `mergeable` label
- **THEN** the landing command may merge it

#### Scenario: The label is absent

- **WHEN** `mergeable` is absent
- **THEN** the session leaves the pull request open, may maintain `owner-review`, comments the review and does not merge

#### Scenario: The advisory label does not authorize landing

- **WHEN** a pull request carries `owner-review` but not `mergeable`
- **THEN** the session does not merge it

#### Scenario: The merged tree matches

- **WHEN** the merged main tree equals the reviewed tree
- **THEN** the session archives the change after the merge

#### Scenario: The merged tree differs

- **WHEN** the merged main tree differs from the reviewed tree
- **THEN** archive is refused until another review is ready
