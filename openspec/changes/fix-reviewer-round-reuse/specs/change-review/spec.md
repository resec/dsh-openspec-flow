# Spec Delta

## REMOVED Requirements

### Requirement: Each review round activates its reviewer

**Reason**: This requirement over-corrected a missing wake message. Starting a new reviewer on every round contradicts the single-reviewer contract and loses the context needed to verify earlier findings.

**Migration**: No record migration. A new round wakes the existing slot reviewer; `replace` remains the way to start a new reviewer.

## ADDED Requirements

### Requirement: Each review round wakes the reviewer

For a change with `reviewers: 1`, starting a new draft or apply round SHALL wake the review's existing reviewer to read the new brief; it SHALL NOT start another reviewer. Resuming a round whose reviewer has not submitted SHALL NOT wake it again. The slot SHALL keep the same agent and record the round it was woken for. `replace` remains the only way to start a new reviewer.

#### Scenario: A new draft round wakes the same reviewer

- **WHEN** a draft round already has a report and `openspec_review` starts the next draft round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: A new apply round wakes the same reviewer

- **WHEN** an apply round already has a report and `openspec_review` starts the next apply round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: Resuming an unreported round does not wake again

- **WHEN** the latest round has no report and `openspec_review` resumes it
- **THEN** no wake message is sent and the slot keeps its agent

#### Scenario: The same reviewer submits for the new round

- **WHEN** the slot reviewer submits a report for the new round
- **THEN** the submission is accepted

#### Scenario: A first round with no slot activates a reviewer

- **WHEN** a review with `reviewers: 1` has no reviewer slot
- **THEN** one reviewer activation starts
