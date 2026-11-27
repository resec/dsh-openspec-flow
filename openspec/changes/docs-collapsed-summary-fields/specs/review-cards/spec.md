# Spec Delta

## MODIFIED Requirements

### Requirement: The client renders a collapsed card

Each card SHALL be collapsed by default and SHALL show one summary line in this order: the phase title, the recorded change name when present, the review kind, the round token when recorded, otherwise the numeric round, the verdict and a count for each severity `critical`, `major`, `minor` and `nit`. The counts SHALL cover every recorded finding and the summary SHALL NOT show a next action. Labels SHALL be fixed Chinese strings independent of the locale, and selecting a card SHALL expand it.

#### Scenario: A collapsed card appears

- **WHEN** the turn tail receives one card
- **THEN** it shows a collapsed card with the summary fields in the stated order
- **AND** the summary carries `critical`, `major`, `minor` and `nit` counts
- **AND** the summary carries no next action
- **AND** the labels are the fixed Chinese strings

#### Scenario: The summary shows the round token

- **WHEN** a card records `roundToken: "E1"`
- **THEN** the summary shows `E1` instead of the numeric round
- **AND** a card without a recorded token shows its numeric round

#### Scenario: Counts cover disposed findings

- **WHEN** the card records findings with open, fixed and waived statuses
- **THEN** the severity counts include every recorded finding
