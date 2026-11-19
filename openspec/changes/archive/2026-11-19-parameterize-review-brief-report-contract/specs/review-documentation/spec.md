# Spec Delta

## ADDED Requirements

### Requirement: The review document states the shared brief report contract

`docs/review.md` SHALL state that the draft and apply briefs render one report contract for the current round from the same source, and that the contract names the finding id rule, the verification statuses and when verifications are empty.

#### Scenario: Document describes the shared contract

- **WHEN** a reader opens the review document
- **THEN** it states that both briefs render one round-aware report contract from the same source
- **AND** it names the finding id rule and the empty-verifications first-round case
