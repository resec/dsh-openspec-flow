# Spec Delta

## ADDED Requirements

### Requirement: Legacy cards remain readable after the shared-root upgrade

The plugin SHALL keep cards written under the legacy review root readable after the shared-root upgrade. When no shared record exists for a change but a legacy record or legacy card directory exists, the client card reader SHALL return those cards from the legacy root until the record is copied. The reader SHALL NOT copy or migrate the record.

#### Scenario: A legacy card stays visible

- **WHEN** a card exists under `openspec/.review/<store>#<change>/cards/` and the shared root has no record for that change
- **THEN** `reviewCards/get` still returns that card

#### Scenario: A copied record reads shared cards

- **WHEN** the legacy record has been copied to the shared root
- **THEN** the card reader reads cards from the shared record directory

#### Scenario: A removed shared record does not resurrect legacy cards

- **WHEN** a migrated shared record is removed and the migration marker remains
- **THEN** the card reader does not return the retained legacy cards as if the review were current

### Requirement: A legacy card keeps the turn binding

A returned legacy card SHALL still be bound to the request turn and the delivery watermark SHALL be updated under the existing card contract.

#### Scenario: A legacy card is bound to the turn

- **WHEN** the card reader returns a legacy card for the current turn
- **THEN** it writes the turn binding and delivery watermark under the existing card contract without copying the record
