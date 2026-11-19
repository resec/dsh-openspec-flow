# Spec Delta

## ADDED Requirements

### Requirement: Review briefs carry the report contract

The draft and apply briefs SHALL render one report contract as their whole `## Report` block for the current round. It SHALL name the report fields and required finding fields including `title`, list the verdict, severity and verification-status enums, show a finding id example for the round, state that verifications name only findings recorded before the round, and state that a first round carries none. It SHALL mark impact, rule and failure as required only for critical and major findings.

#### Scenario: First apply round

- **WHEN** the apply brief is built for round 1 with no recorded findings
- **THEN** it states the finding id rule `R<round>-NN` and shows `R1-01` as the finding example
- **AND** its `verifications` example is an empty array with no finding id
- **AND** it states that the first round has no verifications to submit
- **AND** it lists `title` among the finding fields

#### Scenario: Later draft round

- **WHEN** the draft brief is built for round 2 with no recorded findings
- **THEN** the finding id example is `R2-01`, not `R1-01`
- **AND** it contains no verification example id

#### Scenario: Verifications name earlier findings

- **WHEN** the apply brief is built for a round that starts with recorded finding `R1-01` in status `fixed`
- **THEN** it states that verifications name findings recorded before the round, with `R1-01` as the example

#### Scenario: Conditional finding fields

- **WHEN** either brief is read
- **THEN** it marks impact, rule and failure as required only for critical and major findings

### Requirement: The report contract maps the brief axes to report values

The report contract SHALL list the report axis enum and state that a finding's axis is one of those values, while the brief's `## Axes` headings are review prompts, not report values.

#### Scenario: Axis values

- **WHEN** the reviewer reads either brief's contract
- **THEN** it states that a finding's axis is one of the listed enum values
- **AND** it states that the brief's Axes headings are review prompts, not report values
