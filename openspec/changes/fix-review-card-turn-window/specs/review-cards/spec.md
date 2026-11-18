# Spec Delta

## MODIFIED Requirements

### Requirement: The Host binds cards to the turn

The Host SHALL return cards already bound to the requested turn, bind unclaimed cards written within that turn to it, and persist the binding for a refresh. It SHALL use the turn start time when provided and otherwise the per-session delivery watermark at `<reviewDir>/card-delivery.json`, outside `cards/`. When a request carries a turn end time, the Host SHALL NOT advance the watermark past that time.

#### Scenario: Unclaimed cards are bound

- **WHEN** the endpoint receives a turn with one unclaimed card written within it
- **THEN** it binds the card to that turn, persists the binding and returns the card

#### Scenario: The watermark is the fallback

- **WHEN** the slot provides no turn start time
- **THEN** the Host uses the per-session delivery watermark to decide which unclaimed cards belong to the turn

#### Scenario: The watermark does not advance past the turn end

- **WHEN** the stored watermark is at or before the turn end and a request carries a turn end time and skips an unclaimed card written after it
- **THEN** the Host leaves the watermark at or before the turn end
- **AND** the skipped card stays eligible for a later turn

#### Scenario: A later stored watermark is kept

- **WHEN** the stored watermark is already later than the request's turn end and an unclaimed card written after it is skipped
- **THEN** the Host keeps the watermark unchanged
- **AND** the skipped card stays unbound for that request

## ADDED Requirements

### Requirement: The Client sends the turn window

The Client SHALL send the turn start and end times from the Slot's `TurnLocation` when each is a finite millisecond value between 2000-01-01 and 2100-01-01. It SHALL omit a missing or implausible time. The end time SHALL be sent as the request's upper bound, so the Host can refuse a card written after the turn.

#### Scenario: The request carries the turn window

- **WHEN** the turn tail renders a completed turn with both times present
- **THEN** the request carries the start time as `from`
- **AND** it carries the end time as `to`

#### Scenario: A missing time is omitted

- **WHEN** the Slot provides no end time
- **THEN** the request omits `to`

#### Scenario: An implausible time is not sent

- **WHEN** a time is not a finite number or is outside 2000-01-01..2100-01-01 in milliseconds
- **THEN** the request omits that bound

### Requirement: The Host skips a card written after the turn end

The Host SHALL NOT bind an unclaimed card whose write time is later than the request's turn end time. Such a card SHALL stay unbound for a later turn. A present but unparsable end time SHALL answer `reviewCards/bad-argument` and bind nothing.

#### Scenario: A later card is skipped

- **WHEN** an unclaimed card was written after the requested turn's end time
- **THEN** the Host skips it and leaves it unbound

#### Scenario: A later turn binds the skipped card

- **WHEN** the turn whose window contains the skipped card asks for its cards
- **THEN** the Host binds the card to that turn

#### Scenario: An unparsable end time is rejected

- **WHEN** the request carries an unparsable turn end time
- **THEN** the Host answers `reviewCards/bad-argument` and binds no card

### Requirement: The Host orders returned cards by write time

The Host SHALL order returned cards by phase with review cards before resolution cards, and within one phase by write time ascending, using round only as the tie-break. A later round of one review kind SHALL NOT be ordered before an earlier round of another kind by round alone.

#### Scenario: An earlier draft round precedes a later apply round

- **WHEN** one turn returns a draft round-4 card written at 12:13 and an apply round-1 card written at 12:29
- **THEN** the draft card is listed first

#### Scenario: Review cards precede resolution cards

- **WHEN** a turn returns review and resolution cards
- **THEN** every review card is listed before every resolution card
