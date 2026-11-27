# Spec Delta: review entry model

## MODIFIED Requirements

### Requirement: A review round writes one card file

At the review and resolution points the Host SHALL write one card JSON file at `cards/<sessionKey>-<kind>-<phase>-<round>[-a<attempt>].json`, where `sessionKey` is a short SHA-256 of the session id and `kind` is the review entry name. A review card's first attempt keeps the suffix-less name and a later attempt carries `-a<n>`. A card written under the earlier name without a kind SHALL stay readable. The plugin SHALL NOT append a Session event or import an `@deepseek-ai/*` package.

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
- **THEN** each card has its own file named with its entry
- **AND** both cards are returned for that session

#### Scenario: A pr card uses its entry name

- **WHEN** one session writes a `pr` review card for a round
- **THEN** the file name carries `pr` as its kind
- **AND** the reader returns it beside the draft and apply cards

#### Scenario: An earlier card name stays readable

- **WHEN** a card file carries the earlier name without a kind
- **THEN** the reader still returns that card

#### Scenario: A refreshed attempt writes its own card

- **WHEN** a round's earlier attempt already wrote a review card and the refreshed round submits a report
- **THEN** a second review card file with `-a2` in its name is written
- **AND** the earlier card file and its turn binding stay on disk

### Requirement: The card's review kind selects the record

The card's recorded `review` value SHALL select the record the delivery rule compares against: `apply` selects `apply-review.json`, `draft` selects `review.json`, and another entry selects `<entry>-review.json`. A missing kind SHALL select `review.json`. The record lookup SHALL be cached per review directory and entry within one request.

#### Scenario: Both kinds in one directory

- **WHEN** one review directory holds a draft self card and an apply changer card
- **THEN** the draft self card is delivered
- **AND** the apply changer card is withheld

#### Scenario: A pr card selects its own record

- **WHEN** a card records `review: "pr"` and the directory holds `pr-review.json`
- **THEN** the delivery rule compares the card against the `pr` record

#### Scenario: A missing kind selects the draft record

- **WHEN** a card carries no recorded `review` kind
- **THEN** the delivery rule compares it against `review.json`

### Requirement: The collapsed summary shows the change name

The collapsed summary SHALL show the recorded change name between the phase title and the review entry name. The name SHALL be the recorded `change` value with surrounding whitespace removed; an absent, empty or non-string value SHALL omit the segment. The review entry name SHALL be the card's recorded `review` value; a missing value SHALL render `draft`. The change name is recorded data and is not a translated label.

#### Scenario: Change name appears in the summary

- **WHEN** a card records `change: "add-export-api"` and `review: "pr"`
- **THEN** the collapsed summary reads `评审汇报 · add-export-api · pr · 第 2 轮 · …`
- **AND** a resolution card uses the same order as `处理汇报 · add-export-api · pr · …`

#### Scenario: A missing change name omits the segment

- **WHEN** a card has no recorded change name
- **THEN** the summary keeps `评审汇报 · draft · 第 2 轮 · …` without an empty segment

#### Scenario: A missing entry name renders draft

- **WHEN** a card carries no recorded `review` value
- **THEN** the summary renders `draft` as the entry segment
