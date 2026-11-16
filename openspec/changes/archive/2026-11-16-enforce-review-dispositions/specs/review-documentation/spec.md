# Spec Delta

## ADDED Requirements

### Requirement: The document states the reviewer read targets and the resume gate

`docs/review.md` SHALL state that `openspec_reviewer` `read` supports `brief`, `own-report` with an optional `round`, `findings` and `status`; that `dispositions` belongs to `action: "dispose"` or a finding `action: "waive"`; that `resume` opens no new round while a recorded finding is open; and that `start` and `resume` reject `dispositions`.

#### Scenario: The document lists the read targets

- **WHEN** `docs/review.md` describes the reviewer tool
- **THEN** it names `brief`, `own-report` with an optional `round`, `findings` and `status`

#### Scenario: The document states the dispose-then-resume order

- **WHEN** `docs/review.md` describes a new review round
- **THEN** it says every recorded finding must be disposed before `resume` opens the next round
- **AND** it says `start` and `resume` reject `dispositions`

#### Scenario: The document separates the disposition actions

- **WHEN** `docs/review.md` describes `dispositions`
- **THEN** it says the batch belongs to `action: "dispose"` or a finding `action: "waive"`
- **AND** it does not describe `resume` as carrying dispositions
