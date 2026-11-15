# Spec Delta: change-review

## MODIFIED Requirements

### Requirement: The changer waits for the reviewer report

`openspec_review` with `action: "wait"` SHALL wait for the reviewer's report or the review deadline. It SHALL return `waiting`, `ready` or `overdue`; it SHALL not treat a still-pending reviewer as pass. It SHALL poll at an interval read from `OPENSPEC_FLOW_REVIEW_POLL_MS`, defaulting to `250` milliseconds and accepting integer values from `10` to `60000`; an absent, non-numeric or out-of-range value SHALL use the default.

#### Scenario: Reviewer submits

- **WHEN** the reviewer submits a report before the deadline
- **THEN** wait returns and the readiness calculation runs

#### Scenario: Deadline passes

- **WHEN** no report arrives before the wait limit
- **THEN** wait returns `overdue`

#### Scenario: A caller overrides the poll interval

- **WHEN** `OPENSPEC_FLOW_REVIEW_POLL_MS` is set to a value in range
- **THEN** wait polls at that interval and still returns `waiting`, `ready` or `overdue` by the same rules

#### Scenario: An invalid poll interval falls back

- **WHEN** `OPENSPEC_FLOW_REVIEW_POLL_MS` is absent, non-numeric or outside `10`-`60000`
- **THEN** wait polls every 250 milliseconds
