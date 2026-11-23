# Spec Delta

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

## ADDED Requirements

### Requirement: The flow rule states the no-edit rule

The registered flow rule SHALL state that the change artifacts must not be edited while a draft round is open, that an edit closes the round as blocked with no findings, and that `resume` then opens the next round and wakes the reviewer.

#### Scenario: The rule states the no-edit rule

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the change artifacts must not be edited while a draft round is open

#### Scenario: The rule states the blocked recovery

- **WHEN** the flow rule describes an edit during a round
- **THEN** it states that the round closes as blocked and that `resume` opens the next round
