# Spec Delta

## ADDED Requirements

### Requirement: A profile initialization failure carries both ends of the output

When the lab cannot initialize an isolated profile, the reported failure SHALL carry the beginning of the command output, where the cause appears, as well as its end, after dropping leading and trailing whitespace. The retained text SHALL NOT exceed the budget plus the marker, a summary SHALL only be used when it shortens the output, and a marker SHALL show where the middle was omitted.

#### Scenario: An over-long output keeps its first line

- **WHEN** a profile initialization fails and the command output exceeds the budget
- **THEN** the reported failure carries the first line of that output
- **AND** it carries the last part of that output
- **AND** it carries a marker where the middle was omitted

#### Scenario: An output within the budget arrives whole

- **WHEN** a profile initialization fails and the command output fits within the budget
- **THEN** the reported failure carries that output without a marker
- **AND** surrounding whitespace is dropped from it

#### Scenario: An output the summary would not shorten arrives whole

- **WHEN** the output exceeds the budget by less than the marker costs
- **THEN** the reported failure carries the output without a marker

#### Scenario: The retained text stays bounded

- **WHEN** a profile initialization fails with an output far larger than the budget
- **THEN** the retained text does not grow with the size of that output

### Requirement: A failing profile initialization keeps its output

When the lab cannot initialize an isolated profile and the run directory accepts a write, the untouched command output SHALL be kept there and the reported failure SHALL name the file that holds it. A failed write SHALL NOT replace the diagnosis.

#### Scenario: The output lands in the run directory

- **WHEN** a profile initialization fails and the run directory accepts a write
- **THEN** the untouched output is written under the run directory
- **AND** the reported failure names that file

#### Scenario: A rejected write keeps the diagnosis

- **WHEN** the run directory rejects the write
- **THEN** the reported failure still carries both ends of the output
- **AND** it names no file
