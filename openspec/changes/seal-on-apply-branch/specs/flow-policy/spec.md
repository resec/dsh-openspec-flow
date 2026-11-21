# flow-policy delta

## MODIFIED Requirements

### Requirement: The flow rule states the draft review gate

The registered flow rule SHALL require a draft review before apply when enabled. It SHALL state that the draft object is the change artifacts plus intent, that `reviewers: 0` means the changer reports, that `openspec_apply_next` refuses an unready review, that a git worktree apply seals on the apply branch without an agent commit or a moved main, that a worktree-disabled git project keeps the committed-`HEAD` seal, and that the draft freezes once apply starts.

#### Scenario: Draft review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables draft review
- **THEN** the flow rule names `openspec_review` and the draft review gate before apply

#### Scenario: Draft review is disabled

- **WHEN** the change policy disables draft review
- **THEN** the flow rule does not require a draft review for that change

#### Scenario: The rule does not require a commit for draft review

- **WHEN** the flow rule describes the draft review object
- **THEN** it states that the draft object is the change artifacts, not a git tree or commit

#### Scenario: The rule names the seal

- **WHEN** the flow rule is registered for an OpenSpec project
- **THEN** it states that a git worktree apply seals on the apply branch at the first apply without an agent commit and without advancing main
- **AND** it states that a worktree-disabled git project keeps the committed-`HEAD` seal and that the agent commits the change directory there

#### Scenario: The rule freezes the draft after apply

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the draft review cannot be resumed after apply started

### Requirement: The flow rule states the seal staging boundary

The registered flow rule SHALL state that a git worktree seal is constructed by the plugin from the reviewed change directory and the plugin-written `openspec/.gitignore` when present, that for that path those two may stay uncommitted, that the worktree-disabled path commits them itself, and that no other change directories or code files are staged.

#### Scenario: Rule names the staging boundary

- **WHEN** the flow rule describes the seal commit
- **THEN** it states that the seal commit stages the reviewed change directory and the plugin-written `openspec/.gitignore` when present

#### Scenario: Rule names both seal paths

- **WHEN** the flow rule describes the seal
- **THEN** it states that the plugin constructs the seal for a git worktree apply
- **AND** it states that a worktree-disabled project commits the seal itself

#### Scenario: Rule names the allowed uncommitted paths

- **WHEN** the flow rule describes the dirty-tree check for a git worktree apply
- **THEN** it states that the reviewed change directory and the plugin-written ignore file may stay uncommitted for that seal
- **AND** it states that the worktree-disabled path commits those paths and that other change directories and code files are not staged
