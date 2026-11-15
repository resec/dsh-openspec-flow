# Spec Delta

## ADDED Requirements

### Requirement: Apply review validates the committed tree strictly

`openspec_review` with `review: "apply"` SHALL run `openspec validate` with the strict option for the committed change before opening a start or resume round. It SHALL refuse the round when validation reports an issue, naming each issue, and SHALL NOT create or advance a round. The apply review brief SHALL carry the host's validation result so the reviewer does not run validation itself.

#### Scenario: Apply review starts after a strict pass

- **WHEN** the committed change passes `openspec validate --strict`
- **THEN** the apply review start opens a round and the brief records the strict pass

#### Scenario: Strict validation reports a warning

- **WHEN** the committed change has a strict-only warning
- **THEN** the apply review start or resume fails and names the issue
- **AND** no round is opened

#### Scenario: Reviewer reads the validation result

- **WHEN** the reviewer reads the apply review brief
- **THEN** the brief states the host validated the tree strictly and the reviewer is not expected to run validation
