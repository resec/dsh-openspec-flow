# flow-policy Specification Delta

## ADDED Requirements

### Requirement: The flow rule states the draft review gate

The registered flow rule SHALL require a draft review before apply when the change enables it. It SHALL state that the draft review object is the change artifacts and the intent, that `reviewers: 0` means the changer writes the report, and that `openspec_apply_next` refuses a change whose review is not ready.

#### Scenario: Draft review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables draft review
- **THEN** the flow rule names `openspec_review` and the draft review gate before apply

#### Scenario: Draft review is disabled

- **WHEN** the change policy disables draft review
- **THEN** the flow rule does not require a draft review for that change

#### Scenario: The rule does not require a commit for draft review

- **WHEN** the flow rule describes the draft review object
- **THEN** it states that the draft object is the change artifacts, not a git tree or commit
