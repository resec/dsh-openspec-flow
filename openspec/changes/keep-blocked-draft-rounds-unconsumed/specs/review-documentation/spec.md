# Spec Delta

## MODIFIED Requirements

### Requirement: The review document states the stale-round block

`docs/review.md` SHALL state that editing the change artifacts during an open draft round gives one watch notice per changed object version, that the reviewer submits `blocked`, that a blocked attempt does not consume a round number, and that `resume` archives the attempt under `round-N/revisions/MM/` and refreshes the same round. It SHALL state that the archived brief, hashes, report, cause and notice stay readable and that the unreported-round reuse rule requires an unchanged object.

#### Scenario: The document states the no-edit rule

- **WHEN** the review document is read
- **THEN** it states that a draft round must not be edited and names the watch notice

#### Scenario: The document qualifies the reuse rule

- **WHEN** the review document describes resuming an unreported round
- **THEN** it states that the reuse and the missing wakeup apply only while the object is unchanged

#### Scenario: The document states the recovery

- **WHEN** the review document describes a blocked attempt
- **THEN** it states that `resume` archives the attempt and refreshes the same round
- **AND** it states that the round number does not advance

#### Scenario: The document states the audit

- **WHEN** the review document describes an archived attempt
- **THEN** it names the revision directory and the preserved brief, hashes, report, cause and notice

## ADDED Requirements

### Requirement: The document states the attempt revision layout

`docs/review.md` SHALL state that a refreshed draft round keeps its previous attempts under `round-N/revisions/MM/` as `brief.md`, an optional `report.json` and the recorded hashes, cause and archive time, and that the review record lists them in a `revisions` array.

#### Scenario: The layout is documented

- **WHEN** a reader looks up where a replaced attempt is stored
- **THEN** the document names `round-N/revisions/MM/` and the record's `revisions` array

#### Scenario: The preserved facts are documented

- **WHEN** a reader looks up the audit facts
- **THEN** the document names the brief, hashes, optional blocked report, cause and archive time

### Requirement: The README states the blocked-round reuse

`README.md` SHALL state that a blocked draft attempt does not consume a round number, that `resume` refreshes the same round, and that the replaced attempt stays readable under `round-N/revisions/MM/`. It SHALL name `docs/review.md` for the details.

#### Scenario: The README states the reuse

- **WHEN** the README review section is read
- **THEN** it states that a blocked draft attempt does not consume a round number and that its audit stays readable

#### Scenario: The README links the document

- **WHEN** the README describes the blocked-round reuse
- **THEN** it names `docs/review.md`
