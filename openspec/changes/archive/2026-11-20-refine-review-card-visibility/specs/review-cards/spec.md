# Spec Delta: review-cards

## REMOVED Requirements

### Requirement: The main session receives the independent review card

**Reason**: The changer session no longer keeps a copy of the reviewer's report card. The review card belongs to the session that submits the report, so an independent review keeps it in the reviewer session only; the changer still reads the report through `report` and through the resolution card.
**Migration**: Remove the `wait`/`report` review-card writes and withhold existing changer review cards at delivery. Card files and review records are not deleted or rewritten.

## ADDED Requirements

### Requirement: A review card is written by the reporting session

At the review point the Host SHALL write the review card for the session that submits the report: the changer session for `self-report` in a self review, and the reviewer session for `openspec_reviewer` `submit` in an independent review. `wait` and `report` SHALL NOT write a review card or add a card marker. The resolution card keeps its current write points.

#### Scenario: Self review writes the changer card

- **WHEN** a changer submits `self-report` for a self review
- **THEN** one card file with `phase: "review"` is written for the changer session
- **AND** the review record marks the card as written

#### Scenario: Independent review writes only the reviewer card

- **WHEN** a reviewer submits a report for an independent review
- **THEN** one card file with `phase: "review"` is written for the reviewer session
- **AND** no review card file is written for the changer session

#### Scenario: Wait and report write no review card

- **WHEN** a changer calls `wait` and then `report` after a reviewer submitted
- **THEN** no review card file is written for the changer session
- **AND** `report` still returns the stored report

#### Scenario: Report does not backfill a self-review card

- **WHEN** a self review's `self-report` wrote no card and the changer calls `report`
- **THEN** no review card file or card marker is written

### Requirement: The card's review kind selects the record

The card's recorded `review` kind SHALL select the record the delivery rule compares against: `apply` selects `apply-review.json`, every other value selects `review.json`. A missing kind SHALL select `review.json`. The record lookup SHALL be cached per review directory and review kind within one request.

#### Scenario: Both kinds in one directory

- **WHEN** one review directory holds a draft self card and an apply changer card
- **THEN** the draft self card is delivered
- **AND** the apply changer card is withheld

#### Scenario: A missing kind selects the draft record

- **WHEN** a card carries no recorded `review` kind
- **THEN** the delivery rule compares it against `review.json`

### Requirement: The Host withholds the changer's independent review card

For an independent review the Host SHALL NOT return or bind a `phase: "review"` card whose card session equals the review record's `changerSessionId`, including a card written before this rule. The record's `independent: true` or `mode: "reviewer"` SHALL identify an independent review. A missing or unreadable record, a missing `changerSessionId`, or a self review SHALL leave delivery unchanged.

#### Scenario: Changer card is withheld

- **WHEN** an independent review record names the changer session and the endpoint receives that session's review card
- **THEN** the card is not returned
- **AND** an unbound card is not bound to the turn

#### Scenario: A bound changer card is withheld

- **WHEN** the changer's review card already records the requested turn
- **THEN** the card is still not returned

#### Scenario: Reviewer card is delivered

- **WHEN** the review card belongs to the reviewer session
- **THEN** the card is returned

#### Scenario: Self review card is delivered

- **WHEN** the review record marks a self review
- **THEN** the changer's review card is returned

#### Scenario: A record that cannot prove independence keeps delivery

- **WHEN** the review record is missing, unreadable or has no `changerSessionId`
- **THEN** the card is returned under the existing delivery rules

### Requirement: The collapsed summary shows the change name

The collapsed summary SHALL show the recorded change name between the phase title and the review kind. The name SHALL be the recorded `change` value with surrounding whitespace removed; an absent, empty or non-string value SHALL omit the segment. The change name is recorded data and is not a translated label.

#### Scenario: Change name appears in the summary

- **WHEN** a card records `change: "add-export-api"`
- **THEN** the collapsed summary reads `评审汇报 · add-export-api · draft · 第 2 轮 · …`
- **AND** a resolution card uses the same order as `处理汇报 · add-export-api · draft · …`

#### Scenario: A missing change name omits the segment

- **WHEN** a card has no recorded change name
- **THEN** the summary keeps `评审汇报 · draft · 第 2 轮 · …` without an empty segment

## MODIFIED Requirements

### Requirement: The Host binds cards to the turn

The Host SHALL return cards already bound to the requested turn, bind unclaimed cards written within that turn to it, and persist the binding for a refresh. It SHALL NOT return or bind a review card withheld by the independent-review delivery rule. It SHALL use the turn start time when provided and otherwise the per-session delivery watermark at `<reviewDir>/card-delivery.json`, outside `cards/`. When a request carries a turn end time, the Host SHALL NOT advance the watermark past that time.

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

### Requirement: Legacy cards remain readable after the shared-root upgrade

The plugin SHALL keep cards written under the legacy review root readable after the shared-root upgrade. When no shared record exists for a change but a legacy record or legacy card directory exists, the client card reader SHALL return those cards from the legacy root until the record is copied, except a review card withheld by the independent-review delivery rule. The reader SHALL NOT copy or migrate the record.

#### Scenario: A legacy card stays visible

- **WHEN** a card exists under `openspec/.review/<store>#<change>/cards/` and the shared root has no record for that change
- **AND** the delivery rule does not withhold it
- **THEN** `reviewCards/get` still returns that card

#### Scenario: A withheld legacy changer card stays hidden

- **WHEN** a legacy changer review card belongs to an independent review
- **THEN** `reviewCards/get` does not return it
- **AND** it is not bound to the turn

#### Scenario: A copied record reads shared cards

- **WHEN** the legacy record has been copied to the shared root
- **THEN** the card reader reads cards from the shared record directory

#### Scenario: A removed shared record does not resurrect legacy cards

- **WHEN** a migrated shared record is removed and the migration marker remains
- **THEN** the card reader does not return the retained legacy cards as if the review were current
