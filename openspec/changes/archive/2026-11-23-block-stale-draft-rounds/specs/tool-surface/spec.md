# Spec Delta

## ADDED Requirements

### Requirement: A stale reviewer submit is accepted only as blocked

In a draft review, while the current object hash differs from the round's hash, `openspec_reviewer` with `action: "submit"` SHALL accept only a `blocked` report with no findings. It SHALL store the report with `blockedReason: "stale-object"` and both hashes, and apply the normal submit wakeup. Any other verdict or a report with findings SHALL be refused without storing it, and the refusal SHALL name `blocked`. An unchanged object and apply reviews are unchanged.

#### Scenario: A blocked submission closes the stale round

- **WHEN** the reviewer submits a `blocked` report with no findings while the draft object hash differs from the round's hash
- **THEN** the report is stored with the stale-object cause and both hashes
- **AND** the changer receives the normal submit wakeup

#### Scenario: A pass submission on a stale object is refused

- **WHEN** the reviewer submits a `pass` report while the draft object hash differs from the round's hash
- **THEN** the call fails, the message names `blocked`, and no report is stored

#### Scenario: A blocked submission with findings is refused

- **WHEN** the reviewer submits a `blocked` report that carries findings while the object is stale
- **THEN** the call fails and no report is stored

#### Scenario: A finding awaiting verification does not block the stale submission

- **WHEN** a recorded finding is `fixed` awaiting a later verification and the object goes stale
- **THEN** the blocked submission is stored and the finding stays `fixed`

#### Scenario: An unchanged object keeps the submit path

- **WHEN** the current object hash equals the round's hash, no stale notice is recorded, and the reviewer submits any valid report
- **THEN** the report is stored as before

#### Scenario: An apply review keeps the submit path

- **WHEN** the apply review's object hash differs from its round's hash and the reviewer submits
- **THEN** the submit is handled as before this change

### Requirement: A draft submit names its round after a stale notice

Once a draft review records a stale notice, `openspec_reviewer` with `action: "submit"` SHALL require the `round` argument. It SHALL refuse a submission that omits the round and name the current round, and it SHALL refuse a round that is not the current one. The notice is kept for the rest of the review, so every later draft submit names its round.

#### Scenario: An untokened submit after a stale notice is refused

- **WHEN** the record carries a stale notice and the reviewer submits without a round
- **THEN** the call fails naming the current round and no report is stored

#### Scenario: A late blocked submission names its round

- **WHEN** the reviewer submits a `blocked` report for a round that is no longer current
- **THEN** the call fails naming the current round and no report is stored

#### Scenario: A tokened submit after a stale notice is accepted

- **WHEN** the record carries a stale notice and the reviewer submits a valid report with the current round
- **THEN** the report is stored
