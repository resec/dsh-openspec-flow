# Spec Delta

## ADDED Requirements

### Requirement: The flow rule states the cross-change review boundary

The registered flow rule SHALL state that a reviewer must not require changes to another change's artifacts and must not require edits to a change whose draft round has no report, and that such a concern belongs in `outOfScope`. It SHALL keep the rule that the changer must not edit a change's artifacts while a draft round is open.

#### Scenario: The rule states the reviewer boundary

- **WHEN** the flow rule describes review
- **THEN** it states that a reviewer must not require changes to another change's artifacts

#### Scenario: The rule states the open-round boundary

- **WHEN** the flow rule describes a draft round
- **THEN** it states that a change whose draft round has no report must not be asked to edit its artifacts
- **AND** it states that such a concern belongs in `outOfScope`

#### Scenario: The rule keeps the changer's no-edit rule

- **WHEN** the flow rule describes the draft gate
- **THEN** it still states that the change artifacts must not be edited while a draft round is open
