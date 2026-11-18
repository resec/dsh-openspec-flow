# Spec Delta: review-cards

## MODIFIED Requirements

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

## ADDED Requirements

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
