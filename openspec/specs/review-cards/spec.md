# review-cards Specification

## Purpose
Lets the plugin report every review round through a self-contained card in the conversation, so neither the changer nor the reviewer has to restate the report in prose.

## Requirements

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

### Requirement: The client renders a collapsed card

Each card SHALL be collapsed by default and SHALL show the title, round, verdict and a count for each finding severity `critical`, `major`, `minor` and `nit`, in that order. The counts SHALL cover every recorded finding and the summary SHALL NOT show a next action. Card labels SHALL be fixed Chinese strings independent of the page locale. Selecting a card SHALL expand it.

#### Scenario: A collapsed card appears

- **WHEN** the turn tail receives one card
- **THEN** it shows a collapsed card with the summary fields
- **AND** the summary carries `critical`, `major`, `minor` and `nit` counts
- **AND** the summary carries no next action
- **AND** the labels are the fixed Chinese strings

#### Scenario: Counts cover disposed findings

- **WHEN** the card records findings with open, fixed and waived statuses
- **THEN** the severity counts include every recorded finding

### Requirement: An expanded card shows the complete report

Activating a card SHALL expand it to the round: the report verdict and summary, round metadata, every recorded report finding field, verification evidence, recorded disposition notes and waivers, residual risks, out-of-scope entries, the plan-change waiver and the readiness reasons. A finding's `规则` or `失败路径` and a disposition's `豁免` or `批准者` SHALL be omitted when its value is null, undefined or empty. The expanded body SHALL NOT truncate or paginate and SHALL be scrollable.

#### Scenario: The card expands to the full report

- **WHEN** the user activates a collapsed card
- **THEN** the card shows the report verdict and summary, every recorded report finding field, verification evidence, disposition note, residual risk and out-of-scope entry without truncation

#### Scenario: Unrecorded optional fields are omitted

- **WHEN** a finding has no rule or failure path and a disposition has no waiver or approver
- **THEN** the card omits those rows
- **AND** it keeps the finding's problem, evidence, impact and suggestion and the disposition's note and verification round

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

### Requirement: The expanded card groups readiness reasons

The expanded card SHALL list readiness reasons one per line and SHALL merge reasons of the form `finding <id> is <state>` and `blocking finding <id> is <state>` that share the same blocking flag and state into one line. A merged line SHALL list the finding ids in first-seen order, SHALL use the singular sentence for one id, and SHALL render several ids as `findings <ids> are <state>`, prefixed with `blocking ` for a blocking group. A reason that does not match that form SHALL render unchanged.

#### Scenario: Same-state findings merge

- **WHEN** the readiness reasons are `finding R3-01 is open`, `finding R3-02 is open` and `finding R3-03 is open`
- **THEN** the expanded card shows one line `findings R3-01, R3-02, R3-03 are open`
- **AND** it does not show three separate reason lines

#### Scenario: Blocking and non-blocking reasons stay apart

- **WHEN** readiness carries `blocking finding R2-01 is deferred` and `finding R2-02 is deferred`
- **THEN** the card shows two lines, one with the blocking prefix and one without

#### Scenario: Several blocking findings keep the prefix

- **WHEN** readiness carries `blocking finding R2-01 is deferred` and `blocking finding R2-02 is deferred`
- **THEN** the card shows one line `blocking findings R2-01, R2-02 are deferred`

#### Scenario: Unmatched reasons stay unchanged

- **WHEN** readiness carries `the change artifacts changed since the review started`
- **THEN** the card shows that sentence unchanged

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

### Requirement: A legacy card keeps the turn binding

A returned legacy card SHALL still be bound to the request turn and the delivery watermark SHALL be updated under the existing card contract.

#### Scenario: A legacy card is bound to the turn

- **WHEN** the card reader returns a legacy card for the current turn
- **THEN** it writes the turn binding and delivery watermark under the existing card contract without copying the record

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
