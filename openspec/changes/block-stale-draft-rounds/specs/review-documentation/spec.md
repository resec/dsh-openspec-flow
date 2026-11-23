# Spec Delta

## ADDED Requirements

### Requirement: The review document states the stale-round block

The review document SHALL state that editing the change artifacts during an open draft round closes that round as blocked with no findings, that the reviewer receives one watch notice and submits `blocked`, and that `resume` opens the next round for the current artifacts. The document's existing statement that resuming an unreported round reuses it without another wakeup SHALL be qualified by the unchanged-object condition.

#### Scenario: The document states the no-edit rule

- **WHEN** the review document is read
- **THEN** it states that a draft round must not be edited and names the watch notice

#### Scenario: The document qualifies the reuse rule

- **WHEN** the review document describes resuming an unreported round
- **THEN** it states that the reuse and the missing wakeup apply only while the object is unchanged

#### Scenario: The document states the recovery

- **WHEN** the review document describes a blocked stale round
- **THEN** it states that `resume` opens the next round
