# Spec Delta

## ADDED Requirements

### Requirement: Review skills dispose before resuming

The shipped propose and apply skills SHALL tell the agent to fix findings, dispose every finding in one `openspec_review` call with `action: "dispose"` or a finding `action: "waive"` (a `dispositions` batch or a single `id`), and only then call `action: "resume"`. They SHALL state that `start` and `resume` reject `dispositions`.

#### Scenario: Propose skill orders the calls

- **WHEN** the propose skill reaches a round that is not ready
- **THEN** it fixes the findings, disposes them with `action: "dispose"` or a finding `action: "waive"`, and only then calls `action: "resume"`

#### Scenario: Apply skill orders the calls

- **WHEN** the apply skill reaches a round that is not ready
- **THEN** it fixes the findings, disposes them with `action: "dispose"` or a finding `action: "waive"`, and only then calls `action: "resume"`

#### Scenario: The skills keep the batch form

- **WHEN** the skills describe several findings
- **THEN** they pass every disposition in one `dispositions` call for `dispose` or a finding `waive`
- **AND** they keep the single `id` form for one finding

#### Scenario: The finding waiver route stays available

- **WHEN** a finding needs the user's waiver instead of a fix
- **THEN** the skills name the finding `action: "waive"` with the approved waiver text
