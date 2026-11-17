# Spec Delta: review-cards

## Purpose

Lets the plugin report every review round through a self-contained card in the conversation, so neither the changer nor the reviewer has to restate the report in prose.

## ADDED Requirements

### Requirement: A review round writes one card file

At the review and resolution points the Host SHALL write one card JSON file at `cards/<sessionKey>-<phase>-<round>.json`, where `sessionKey` is a short SHA-256 of the session id. The plugin SHALL NOT append a Session event and SHALL NOT import an `@deepseek-ai/*` package for the card.

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

### Requirement: The card payload carries the round facts

The file payload SHALL carry the phase, change, review kind, round, verdict, state, readiness, mode, object binding, timestamps, finding counts, the complete report object, the recorded findings, the plan-change waiver, the next action and the readiness reasons. Every value SHALL be lossless JSON; a missing report SHALL leave the report body absent.

#### Scenario: The payload carries the complete report

- **WHEN** a card is built for a round with findings and a plan-change waiver
- **THEN** the payload carries every report field, every recorded finding status and the waiver text

#### Scenario: A report file is missing

- **WHEN** the report file cannot be read
- **THEN** the payload omits the report body and keeps the recorded finding states

### Requirement: The main session receives the independent review card

For an independent review the changer's `wait` SHALL write the latest submitted round's review card file for the changer session when it returns `ready`; `report` SHALL write it only when the requested round is the latest submitted round and the card marker is absent. The record SHALL mark the card by session, phase and round. The reviewer's `submit` SHALL write the card file for the reviewer session only.

#### Scenario: Wait writes the main-session card

- **WHEN** a changer calls `wait` and the reviewer already submitted
- **THEN** the main session gets one review card file
- **AND** the review record marks the card as written

#### Scenario: Report does not duplicate the card

- **WHEN** a changer calls `report` after `wait` already wrote the card
- **THEN** no second card file is written
- **AND** the report is still returned

#### Scenario: Report writes the card when wait did not

- **WHEN** a changer calls `report` for a submitted round whose card was never written
- **THEN** the main session gets one review card file

### Requirement: The client queries cards for the current turn

The Client SHALL render, in a `conversation.chat.turnTail` entry, the cards returned by `reviewCards/get` for the current session and turn number. A turn without cards SHALL render nothing, and a card bound to another turn SHALL NOT be reused.

#### Scenario: A card appears after its turn

- **WHEN** a turn ends after a card file was written for the session
- **THEN** the turn tail queries `reviewCards/get` and shows that card

#### Scenario: A refresh keeps the card

- **WHEN** the page is refreshed after a turn with a card
- **THEN** the same turn tail query returns the bound card again

#### Scenario: No card is rendered without data

- **WHEN** the turn has no card file
- **THEN** the turn tail renders nothing
- **AND** an older turn's card is not reused

#### Scenario: The endpoint fails

- **WHEN** `reviewCards/get` fails
- **THEN** the turn tail renders nothing and the review flow is unaffected

### Requirement: The Host binds cards to the turn

The Host SHALL return cards already bound to the requested turn, bind unclaimed cards written within that turn to it, and persist the binding for a refresh. It SHALL use the turn start time when provided and otherwise the per-session delivery watermark at `<reviewDir>/card-delivery.json`, outside `cards/`.

#### Scenario: Unclaimed cards are bound

- **WHEN** the endpoint receives a turn with one unclaimed card written within it
- **THEN** it binds the card to that turn, persists the binding and returns the card

#### Scenario: The watermark is the fallback

- **WHEN** the slot provides no turn start time
- **THEN** the Host uses the per-session delivery watermark to decide which unclaimed cards belong to the turn

### Requirement: The client renders a collapsed card

Each card SHALL be collapsed by default and SHALL show the title, round, verdict, finding counts and next action. Card labels SHALL be fixed Chinese strings independent of the page locale. Selecting a card SHALL expand it.

#### Scenario: A collapsed card appears

- **WHEN** the turn tail receives one card
- **THEN** it shows a collapsed card with the summary fields
- **AND** the labels are the fixed Chinese strings

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

### Requirement: Card files degrade safely

A missing or corrupt card file SHALL render no card and SHALL NOT affect the review record, the report or the conversation log. A failed card write SHALL be logged and SHALL NOT roll back a stored report or a disposal.

#### Scenario: A card file is corrupt

- **WHEN** the endpoint reads a card file that is not valid JSON
- **THEN** it skips that file and returns the other cards

#### Scenario: The card write fails

- **WHEN** the card file cannot be written after a report was stored
- **THEN** the failure is logged and the review state is unchanged
