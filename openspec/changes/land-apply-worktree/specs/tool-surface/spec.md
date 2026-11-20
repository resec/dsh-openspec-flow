# Spec Delta

## MODIFIED Requirements

### Requirement: Apply worktree recovery is exposed as one tool

`openspec_apply_worktree` SHALL expose `recover`, `land` and `remove`. `change` is required for land, remove and the change scope; `store` is optional. Recover requires scope/expectedOwner, land requires `approvedBy: "user"`, and remove abandon requires `approvedBy: "user"` and a reason. Unknown actions and missing approvals SHALL be refused. The reviewer preset SHALL deny it.

#### Scenario: Recovery reports the recovered scope

- **WHEN** recovery removes a dead change lock with the matching token
- **THEN** the result carries `recovered: true` and `scope: "change"`

#### Scenario: Recovery requires its owner token

- **WHEN** a caller omits `expectedOwner`
- **THEN** the tool refuses the call before reading or removing a lock

#### Scenario: An invalid scope is refused

- **WHEN** a caller passes a scope outside `lifecycle` and `change`
- **THEN** the tool refuses the call before reading or removing a lock

#### Scenario: An unknown action is refused

- **WHEN** a caller passes an action outside `recover`, `land` and `remove`
- **THEN** the tool refuses the call and names the three actions

#### Scenario: Land reports the merge and archive

- **WHEN** an approved land succeeds
- **THEN** the result carries the merge commit, archive commit and manifest path

#### Scenario: Land without user approval is refused

- **WHEN** `land` omits `approvedBy: "user"`
- **THEN** the call is refused before any merge

#### Scenario: A missing change is refused

- **WHEN** land, remove or a change-scope recover omits `change`
- **THEN** the call is refused before reading or writing state

#### Scenario: Land reports the state handle

- **WHEN** land succeeds
- **THEN** the result also carries the manifest path and the state

#### Scenario: Remove reports the retained branch

- **WHEN** an archived checkout is removed
- **THEN** the result names the removed path and the retained branch

#### Scenario: The reviewer cannot use the tool

- **WHEN** the independent reviewer's tool catalog is assembled
- **THEN** `openspec_apply_worktree` is absent
