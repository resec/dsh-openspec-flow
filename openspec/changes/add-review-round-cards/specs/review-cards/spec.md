# Spec Delta: review-cards

## Purpose

Lets the plugin report every review round through a self-contained card in the conversation, so neither the changer nor the reviewer has to restate the report in prose.

## ADDED Requirements

### Requirement: A review round writes one card record

A review round SHALL write one `plugin:openspec-flow/review-card` record when its report is submitted, and one when its findings are disposed and the review resumes or becomes ready for apply or archive. The record SHALL NOT appear on the model-visible surface.

#### Scenario: Review point writes a card

- **WHEN** a report is submitted for a review round
- **THEN** one record with `phase: "review"` is appended to the submitting Session
- **AND** the record is not visible to the model

#### Scenario: Resolution point writes a card

- **WHEN** every finding has been disposed and `resume` opens a new round, or disposal (including a waived finding) leaves the next step as apply or archive
- **THEN** one record with `phase: "resolution"` is appended to the changer Session

#### Scenario: A round without findings skips the resolution card

- **WHEN** a report passes with no findings and the review is ready
- **THEN** only the review-point card is written

### Requirement: The card payload carries the round facts

The record SHALL carry the phase, change, review kind, round, verdict, state, readiness, mode, object binding, timestamps, finding counts, the complete report object, the recorded findings, the plan-change waiver, the next action and the readiness reasons. Every value SHALL be lossless JSON; a missing report SHALL leave the report body absent.

#### Scenario: The payload carries the complete report

- **WHEN** a card is built for a round with findings and a plan-change waiver
- **THEN** the payload carries every report field, every recorded finding status and the waiver text

#### Scenario: A report file is missing

- **WHEN** the report file cannot be read
- **THEN** the payload omits the report body and keeps the recorded finding states

### Requirement: The main session receives the independent review card

For an independent review the changer's `wait` SHALL write the latest submitted round's review card into the changer Session when it returns `ready`; `report` SHALL write it only when the requested round is the latest submitted round and the card marker is absent. The record SHALL mark the card by session, phase and round. The reviewer's `submit` SHALL write the card into the reviewer Session only.

#### Scenario: Wait writes the main-session card

- **WHEN** a changer calls `wait` and the reviewer already submitted
- **THEN** the main Session receives one review-point card
- **AND** the review record marks the card as written

#### Scenario: Report does not duplicate the card

- **WHEN** a changer calls `report` after `wait` already wrote the card
- **THEN** no second card is appended
- **AND** the report is still returned

#### Scenario: Report writes the card when wait did not

- **WHEN** a changer calls `report` for a submitted round whose card was never written
- **THEN** the main Session receives one review-point card

### Requirement: Card records fold by turn

The Host SHALL register a session projection keyed `openspecReviewCards` that folds each record into the turn in which it was written. The projection SHALL expose the cards grouped by turn number and no other Session state. A record with a malformed payload SHALL be skipped without failing the fold or later reads.

#### Scenario: A card is grouped under its turn

- **WHEN** a record is committed during turn 4
- **THEN** the projection view places it under turn 4

#### Scenario: Two cards share a turn

- **WHEN** a self-review writes a review card and a resolution card in the same turn
- **THEN** the projection lists both under that turn in write order

#### Scenario: A malformed card is skipped

- **WHEN** a record carries a payload that fails the shape check
- **THEN** the projection skips it and keeps the other cards

### Requirement: The client renders a collapsed card

The Client SHALL render, in a `conversation.chat.turnTail` entry, the cards from `byTurn[turn]` where `turn` is the current turn number supplied by the slot. It SHALL select by that number and SHALL NOT infer a turn from the projection. Each card SHALL be collapsed by default and SHALL show the title, round, verdict, finding counts and next action. Card labels SHALL be fixed Chinese strings independent of the page locale. A turn without cards SHALL render nothing.

#### Scenario: A collapsed card appears

- **WHEN** a turn ends with one review-card record
- **THEN** the turn tail shows a collapsed card with the summary fields
- **AND** the labels are the fixed Chinese strings

#### Scenario: No card is rendered without data

- **WHEN** a turn has no review-card record
- **THEN** the turn tail renders nothing

#### Scenario: An older card is not reused

- **WHEN** the current turn has no record and an older turn has one
- **THEN** the turn tail renders nothing

### Requirement: An expanded card shows the complete report

Activating a card SHALL expand it to the complete round: the report verdict and report summary, round metadata, every report finding field, verification evidence, disposition notes, waiver text, residual risks, out-of-scope entries and the plan-change waiver. The expanded body SHALL NOT truncate or paginate and SHALL be scrollable.

#### Scenario: The card expands to the full report

- **WHEN** the user activates a collapsed card
- **THEN** the card shows the report verdict and summary, every report finding field, verification evidence, disposition note, residual risk and out-of-scope entry without truncation

#### Scenario: A waiver is shown

- **WHEN** a plan-change waiver was recorded for the round
- **THEN** the expanded card shows its approver, text, files and timestamps

### Requirement: The plugin instructs the model not to restate the report

The plugin SHALL instruct the model through the shipped skills, the reviewer brief and the policy text to write only one short note for information the report cannot express and the user must know, and not to restate findings, evidence, impact, rules, failure paths, suggestions, residual risks, scope or notes. The reviewer brief SHALL instruct the reviewer to write no summary after submitting.

#### Scenario: Skills and brief state the rule

- **WHEN** the shipped skills and the reviewer brief are read
- **THEN** each states the short-note rule and the no-restatement rule

### Requirement: The card channel stays out of tool results

The plugin SHALL NOT put the card payload into any tool result and SHALL NOT add a card-specific result field. The existing `report` and `own-report` results SHALL keep returning the stored report.

#### Scenario: Tool results exclude the card payload

- **WHEN** a review tool returns a result
- **THEN** no result carries the card payload or a card-specific field
- **AND** the `report` and `own-report` results still return the stored report

### Requirement: Card records degrade safely

A Session without records SHALL render no cards and keep every existing review behavior. A failed projection registration SHALL be logged and SHALL NOT fail the review tools. A record written before this capability SHALL remain readable and a missing card marker SHALL be treated as empty.

#### Scenario: An old session has no cards

- **WHEN** a Session predates the review-card record
- **THEN** no card is shown and the review tools behave as before

#### Scenario: Projection registration fails

- **WHEN** the projection cannot register
- **THEN** the failure is logged and the review tools still work
