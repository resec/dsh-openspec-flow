# Spec Delta

## MODIFIED Requirements

### Requirement: A failing length gate reports the handling

A failing length gate SHALL write one report to the job summary and the job log. The report SHALL state why the limit exists, list each blocking entry with its path, operation, requirement, length and baseline, name the official handling, name the delta file and requirement line (the file alone when no line is found), and name the local verification command. It SHALL annotate the delta spec file, fail the step, and fail closed when the CLI cannot run or its projection is unreadable.

#### Scenario: A blocking entry is reported

- **WHEN** the gate finds one blocking entry
- **THEN** the job summary shows the rationale, the entry, the official handling, the edit location and the command
- **AND** the job log shows the same report
- **AND** the delta spec file carries an annotation
- **AND** the step exits nonzero

#### Scenario: A local run prints the report

- **WHEN** the gate runs locally and no job summary is configured
- **THEN** the report goes to the log output
- **AND** the exit code is nonzero

#### Scenario: A requirement heading cannot be located

- **WHEN** the delta file has no heading matching the blocking requirement
- **THEN** the edit list names the file without a line number
- **AND** the step still exits nonzero

#### Scenario: The bundled CLI is unavailable

- **WHEN** the gate cannot execute the bundled CLI
- **THEN** it reports the failure and exits nonzero

#### Scenario: The projection cannot be parsed

- **WHEN** the CLI output is not a readable change or spec projection
- **THEN** it reports the failure and exits nonzero
