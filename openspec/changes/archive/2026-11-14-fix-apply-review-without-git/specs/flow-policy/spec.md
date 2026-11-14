# Spec Delta

## MODIFIED Requirements

### Requirement: The flow rule states the apply review gate

The registered flow rule SHALL require an apply review before archive when the change enables it and the project has git. It SHALL state that the apply object is the committed git tree, that the working tree must be clean, that a project without git has no apply review, and that archive proceeds without one when the review is disabled or unavailable.

#### Scenario: Apply review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables apply review
- **THEN** the flow rule names `openspec_review` and the apply review gate before `openspec_archive`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** the flow rule does not require an apply review

#### Scenario: The project has no git

- **WHEN** the project has no git repository
- **THEN** the flow rule states that apply review is unavailable and archive does not wait for it
