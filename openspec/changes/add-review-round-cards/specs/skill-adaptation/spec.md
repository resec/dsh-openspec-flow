# Spec Delta: skill-adaptation

## ADDED Requirements

### Requirement: Review skills report through cards

The shipped propose and apply skills SHALL state that every review round is reported through the plugin card and that the model writes only a short note for information the report cannot express. They SHALL forbid restating findings, evidence, risks, scope or disposition notes. The skills SHALL NOT require a round count or a round cap.

#### Scenario: The propose skill reports a round

- **WHEN** the propose skill completes a draft review round
- **THEN** it relies on the plugin card for the round report
- **AND** it writes no restatement of the report

#### Scenario: The apply skill reports a round

- **WHEN** the apply skill completes an apply review round
- **THEN** it relies on the plugin card for the round report
- **AND** it writes no restatement of the report

#### Scenario: A skill mentions a round cap

- **WHEN** a shipped skill requires a round count or a `maxRounds`
- **THEN** the skill test fails
