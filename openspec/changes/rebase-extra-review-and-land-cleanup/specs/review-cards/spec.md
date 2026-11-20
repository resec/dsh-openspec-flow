# Spec Delta

## ADDED Requirements

### Requirement: Extra round cards carry a sequence and a token

A review card for an extra round SHALL use the round's numeric `seq` for the card file name, the top-level `round` and the payload `round`, and SHALL carry the `roundToken` `E<n>` in the payload. The card reader SHALL accept the card, `buildCard` SHALL resolve the extra round entry, and the payload SHALL carry that entry's `startedAt` and `recordedAt`. Ordering SHALL use the numeric `round` as it does for normal rounds.

#### Scenario: An extra round card is readable

- **WHEN** a card is written for extra round `E1` with `seq` 3
- **THEN** the card file uses round 3 and the Host returns it

#### Scenario: The payload carries the extra token

- **WHEN** an extra round card is built
- **THEN** the payload carries `roundToken: "E1"`, `round: 3` and the extra round timestamps

#### Scenario: Ordering uses the sequence

- **WHEN** cards for normal round 2 and extra round `E1` with `seq` 3 are compared
- **THEN** the extra card sorts after the normal card

### Requirement: The card summary shows the extra round token

The card payload SHALL carry `roundToken`, and the plugin documentation SHALL state that the collapsed and expanded summary shows that token instead of the numeric round. The DSH client renders the summary; the plugin owns the payload and the documentation.

#### Scenario: The payload drives the summary

- **WHEN** an extra round card is built
- **THEN** its payload carries `roundToken: "E1"` for the summary

#### Scenario: The documentation states the display

- **WHEN** the review documentation is read
- **THEN** it states that the summary shows the extra round token instead of the numeric round
