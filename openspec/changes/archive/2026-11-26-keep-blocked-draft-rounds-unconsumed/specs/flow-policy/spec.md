# Spec Delta

## MODIFIED Requirements

### Requirement: The flow rule states the no-edit rule

The registered flow rule SHALL state that the change artifacts must not be edited while a draft round is open, that a changed object version gives the reviewer one watch notice and an optional blocked submit, and that `resume` archives the blocked attempt as a revision and refreshes the same round without advancing the round number, and that the archived brief and hashes stay readable.

#### Scenario: The rule states the no-edit rule

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the change artifacts must not be edited while a draft round is open

#### Scenario: The rule states the blocked recovery

- **WHEN** the flow rule describes an edit during a round
- **THEN** it states that the attempt is archived as a revision
- **AND** it states that `resume` refreshes the same round without advancing the round number

#### Scenario: The rule states the preserved audit

- **WHEN** the flow rule describes the archived attempt
- **THEN** it states that the previous brief and hashes stay readable
