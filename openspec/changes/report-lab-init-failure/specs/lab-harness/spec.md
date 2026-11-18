# Spec Delta

## ADDED Requirements

### Requirement: A profile initialization failure names its cause

When the lab cannot initialize an isolated profile, the reported failure SHALL carry the beginning of the command output, where the failing step and its cause appear, as well as the end of that output. The retained text SHALL be bounded so a single failure cannot flood a terminal, and the marker SHALL make the omission visible. The full output SHALL remain available in the run directory.

#### Scenario: An over-long output keeps its first line

- **WHEN** a profile initialization fails and the command output exceeds the retained budget
- **THEN** the reported failure starts with the first line of that output
- **AND** it ends with the last part of that output
- **AND** it carries a marker where the middle was omitted

#### Scenario: An output within the budget arrives unchanged

- **WHEN** a profile initialization fails and the command output fits within the retained budget
- **THEN** the reported failure carries that output without a marker

#### Scenario: The retained text stays bounded

- **WHEN** a profile initialization fails with an output far larger than the budget
- **THEN** the retained text does not grow with the size of that output
