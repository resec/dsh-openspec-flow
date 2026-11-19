# Spec Delta: change-review

## REMOVED Requirements

### Requirement: The changer checks the reviewer report without polling

**Reason**: The review card is now written only by the session that submits the report. `wait` no longer writes a card or a card marker, so the requirement's card-marker clause and its contention scenario no longer describe the behavior.
**Migration**: Call `wait` as before; it returns the same readiness result without polling. The report remains available through `report` and the reviewer session card; no changer card marker is written.

## ADDED Requirements

### Requirement: The changer reads the reviewer report without polling

`wait` SHALL NOT poll. It SHALL return `ready` when the latest round has a report or the reviewer is waived, `overdue` at the deadline, and `waiting` otherwise; `waiting` sets `waitState: "waiting"` and ends the turn. The result SHALL come from a post-write read that re-reads inside the lock and changes only `changerSessionId`. The deadline remains `waitMinutes`.

#### Scenario: Reviewer already submitted

- **WHEN** the latest round has a report before `wait` is called
- **THEN** `wait` returns `ready` and the readiness calculation runs

#### Scenario: No report before the deadline

- **WHEN** the latest round has no report and the deadline has not passed
- **THEN** `wait` returns `waiting` and instructs the changer to end its turn

#### Scenario: Deadline has passed

- **WHEN** the wait deadline has passed and no report arrived
- **THEN** the wait returns `overdue`

#### Scenario: Wait does not sleep on a poll interval

- **WHEN** `wait` is called for a pending reviewer
- **THEN** it returns from the post-write read without a poll loop
