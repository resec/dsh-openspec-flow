# Spec Delta

## ADDED Requirements

### Requirement: A profile initialization failure carries both ends of the output

When the lab cannot initialize an isolated profile, the reported failure SHALL carry the beginning of the command output, where the cause appears, as well as its end. Leading and trailing whitespace SHALL be dropped, the retained text SHALL be bounded, and a marker SHALL show where the middle was omitted.

#### Scenario: An over-long output keeps its first line

- **WHEN** a profile initialization fails and the command output exceeds the retained budget
- **THEN** the reported failure carries the first line of that output
- **AND** it carries the last part of that output
- **AND** it carries a marker where the middle was omitted

#### Scenario: An output within the budget arrives whole

- **WHEN** a profile initialization fails and the command output fits within the retained budget
- **THEN** the reported failure carries that output without a marker

#### Scenario: The retained text stays bounded

- **WHEN** a profile initialization fails with an output far larger than the budget
- **THEN** the retained text does not grow with the size of that output

### Requirement: A failing profile initialization keeps its output

When the lab cannot initialize an isolated profile, the untouched command output SHALL be kept in the run directory and the reported failure SHALL name the file that holds it.

#### Scenario: The output lands in the run directory

- **WHEN** a profile initialization fails
- **THEN** the untouched output is written under the run directory
- **AND** the reported failure names that file
