# Spec Delta

## ADDED Requirements

### Requirement: Each review round activates its reviewer

For a change with `reviewers: 1`, starting a new draft or apply round SHALL activate a fresh independent reviewer and make it the recorded slot's current agent; resuming a round whose reviewer has not submitted SHALL NOT activate another. The record SHALL name the prior agent and the reason for the new activation, and the prior reviewer SHALL NOT submit for the new round.

#### Scenario: A new draft round activates a reviewer

- **WHEN** a draft round already has a report and `openspec_review` starts the next draft round
- **THEN** a new reviewer activation starts and the recorded slot names the new agent and round

#### Scenario: A new apply round activates a reviewer

- **WHEN** an apply round already has a report and `openspec_review` starts the next apply round
- **THEN** a new reviewer activation starts and the recorded slot names the new agent and round

#### Scenario: Resuming an unreported round does not activate again

- **WHEN** the latest round has no report and `openspec_review` resumes it
- **THEN** no additional reviewer activation starts and the recorded slot keeps its agent

#### Scenario: The prior reviewer cannot submit for the new round

- **WHEN** the reviewer from the previous round submits a report for the current round
- **THEN** the submission is refused because it is not the recorded slot agent
