# Spec Delta

## MODIFIED Requirements

### Requirement: A review round writes one card file

At the review and resolution points the Host SHALL write one card JSON file at `cards/<sessionKey>-<kind>-<phase>-<round>.json`, where `sessionKey` is a short SHA-256 of the session id and `kind` is `draft` or `apply`. A card written under the earlier name without a kind SHALL stay readable. The plugin SHALL NOT append a Session event and SHALL NOT import an `@deepseek-ai/*` package for the card.

#### Scenario: Review point writes a card file

- **WHEN** a report is submitted for a review round
- **THEN** one card file with `phase: "review"` is written for the submitting session
- **AND** the file carries the session, phase, round, write time and complete payload
- **AND** the session log receives no card event

#### Scenario: Resolution point writes a card file

- **WHEN** every finding has been disposed and `resume` opens a new round, or disposal (including a waived finding) leaves the next step as apply or archive
- **THEN** one card file with `phase: "resolution"` is written for the changer session

#### Scenario: A round without findings skips the resolution card

- **WHEN** a report passes with no findings and the review is ready
- **THEN** only the review card file is written

#### Scenario: Draft and apply cards coexist

- **WHEN** one session writes a draft review card and an apply review card for the same round
- **THEN** each card has its own file named with its kind
- **AND** both cards are returned for that session

#### Scenario: An earlier card name stays readable

- **WHEN** a card file carries the earlier name without a kind
- **THEN** the reader still returns that card
