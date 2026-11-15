# Spec Delta

## MODIFIED Requirements

### Requirement: The flow rule states the draft review gate

The registered flow rule SHALL require a draft review before apply when the change enables it. It SHALL state that the draft review object is the change artifacts and the intent, that `reviewers: 0` means the changer writes the report, that `openspec_apply_next` refuses a change whose review is not ready, that a git project seals the draft with a commit that contains the change directory and its OpenSpec ignore file, and that the draft review cannot be resumed once apply started.

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
- **THEN** it states that a git project seals the draft with a commit that contains the change directory and its OpenSpec ignore file
- **AND** it states that apply refuses an unsealed or mixed commit

#### Scenario: The rule freezes the draft after apply

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the draft review cannot be resumed after apply started

### Requirement: The flow rule states the apply review gate

The registered flow rule SHALL require an apply review before archive when the change enables it and the project has git. It SHALL state the apply object is the committed git tree, the working tree must be clean, a no-git project has no apply review, archive proceeds when the review is disabled or unavailable, and a plan change during apply needs a recorded user waiver reviewed by apply review.

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
