# Spec Delta: skill-adaptation

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Review skills name the review kind at every action

Each shipped skill SHALL name its review kind — `review: "draft"` in the propose skill and `review: "apply"` in the apply skill — at every action it names in its review section (`status`, `start`, `self-report`, `wait`, `resume`, `dispose` and a finding `waive`), placed between that action and the next action clause, whether or not the clause repeats `openspec_review`.

#### Scenario: Both review sections name their kind

- **WHEN** either skill describes a review action in its review section
- **THEN** the propose skill passes `review: "draft"` and the apply skill passes `review: "apply"`
- **AND** neither leaves the kind to a default

### Requirement: The skill test rejects an unqualified review call

The packaged-skill test SHALL read the propose skill's draft review section and the apply skill's apply review section. In either section it SHALL scan every `action: "<action>"` occurrence, and for each occurrence it SHALL require that section's review kind between that occurrence and the next `action:` occurrence or the end of the section, so a clause cannot borrow the next clause's kind. It SHALL keep the existing shipped-skill assertions.

#### Scenario: An action clause without the kind fails the test

- **WHEN** an action occurrence reaches the next action occurrence, or the section end, without that section's review kind
- **THEN** the packaged-skill test fails and names the skill

#### Scenario: The shipped skills keep their kinds

- **WHEN** the packaged-skill test runs on the shipped skills
- **THEN** every action occurrence in the propose draft section carries `review: "draft"` before the next action
- **AND** every action occurrence in the apply section carries `review: "apply"` before the next action
