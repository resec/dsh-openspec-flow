# flow-policy Delta

## MODIFIED Requirements

### Requirement: The flow rule states the draft review gate

The registered flow rule SHALL require a draft review before apply when the change enables it. It SHALL state that the draft review object is the change artifacts and the intent, that `reviewers: 0` means the changer writes the report, that `openspec_apply_next` refuses a change whose review is not ready, that a git project seals the draft with a commit that contains the change directory, its OpenSpec ignore file and possibly other `openspec/changes/` paths, and that the draft review cannot be resumed once apply started. It SHALL define a mixed commit as one that changes a path outside those locations.

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
- **THEN** it states that a git project seals the draft with a commit that contains the change directory, its OpenSpec ignore file and possibly other `openspec/changes/` paths
- **AND** it states that apply refuses an unsealed or mixed commit and that mixed means a path outside those locations

#### Scenario: The rule freezes the draft after apply

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the draft review cannot be resumed after apply started

### Requirement: The flow rule states the apply review gate

The registered flow rule SHALL require an apply review before archive when the change enables it and the project has git. It SHALL state the apply object is the committed git tree, the working tree must be clean apart from other changes' uncommitted planning files, a no-git project has no apply review, archive proceeds when the review is disabled or unavailable, and a plan change during apply needs a recorded user waiver reviewed by apply review.

#### Scenario: Apply review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables apply review
- **THEN** the flow rule names `openspec_review` and the apply review gate before `openspec_archive`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** the flow rule does not require an apply review

#### Scenario: The project has no git

- **WHEN** the project has no git repository
- **THEN** the flow rule states that apply review is unavailable and archive does not wait for it

#### Scenario: The rule names the plan-change waiver

- **WHEN** the flow rule describes the apply gate
- **THEN** it states that a plan change during apply needs the user's written waiver
- **AND** it states that apply review reviews the changed planning artifacts

#### Scenario: The rule names the dirty-file exception

- **WHEN** the flow rule describes the apply review clean-tree check
- **THEN** it states that other changes' uncommitted planning files do not count as a dirty tree

## ADDED Requirements

### Requirement: The flow rule states the serial apply boundary

The registered flow rule SHALL state that several changes may hold draft reviews at once, that apply through archive is serial across changes, that another identity's apply and archive entries are refused while an apply lock names it, that draft review and other changes' uncommitted planning files remain available, and that only the user may remove the lock files on request.

#### Scenario: Rule names concurrent draft reviews

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow rule states that several changes may run their draft reviews at the same time

#### Scenario: Rule names the serial apply boundary

- **WHEN** the flow rule describes the apply gate
- **THEN** it states that one change applies and archives at a time
- **AND** it states that another change's apply entry is refused until that change is archived
- **AND** it states that a store change applied from another project is refused until the first project archives
- **AND** it states that draft review stays available while the lock is held

#### Scenario: Rule names the dirty-file exception

- **WHEN** the flow rule describes the seal, apply review or archive checks
- **THEN** it states that another change's uncommitted planning files do not count as a dirty tree

#### Scenario: Rule names the release path as a user action

- **WHEN** the flow rule describes the lock lifetime
- **THEN** it states that a successful archive releases the lock
- **AND** it states that only the user may remove the lock files, on request
- **AND** it directs the agent to ask the user instead of removing it
- **AND** it names where the lock files may live: the implementation domain's worktree git directory or `openspec/.review/`, plus a store change's store domain with its recorded implementation root and stale condition

### Requirement: The flow rule states the seal staging boundary

The registered flow rule SHALL state that the seal commit stages the reviewed change directory and the plugin-written `openspec/.gitignore` when present, and that other change directories and code files are not staged.

#### Scenario: Rule names the staging boundary

- **WHEN** the flow rule describes the seal commit
- **THEN** it states that the seal commit stages the reviewed change directory and the plugin-written `openspec/.gitignore` when present
