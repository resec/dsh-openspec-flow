# Spec Delta

## ADDED Requirements

### Requirement: Pull-request CI runs the requirement length gate

Pull-request CI SHALL run the requirement-length gate after strict artifact validation, using the review classifier over each active change's delta and its main-spec baselines. The gate SHALL fail when a modified description exceeds 500 characters and is longer than its baseline. An unchanged or shortened legacy description SHALL NOT fail it. Strict validation reports an over-long added description first, before the gate runs.

#### Scenario: A modified description grows past the limit

- **WHEN** a modified description exceeds 500 characters and is longer than its main-spec baseline
- **THEN** the gate fails the job
- **AND** the failure names the current and baseline lengths

#### Scenario: A legacy description is unchanged or shortened

- **WHEN** a modified description exceeds 500 characters and is not longer than its baseline
- **THEN** the gate reports no blocking entry
- **AND** the job continues

#### Scenario: Strict validation reports an over-long added description

- **WHEN** a pull request adds a requirement description over 500 characters
- **THEN** strict artifact validation reports it and fails the job
- **AND** the gate does not run

#### Scenario: Strict validation fails for another reason

- **WHEN** strict artifact validation already fails
- **THEN** the gate does not run
- **AND** the job stays failed

### Requirement: A direct gate run covers added descriptions

A gate invoked directly, outside the CI step order, SHALL also fail on an added description over the 500-character limit, so a local run applies the full classifier. The CI step order SHALL remain unchanged.

#### Scenario: A direct run finds an over-long added description

- **WHEN** the gate runs directly on a change whose added description exceeds 500 characters
- **THEN** it exits nonzero
- **AND** it names the delta path, requirement and length

### Requirement: A failing length gate reports the handling

A failing length gate SHALL write each blocking entry, naming the delta path, operation, requirement, length and baseline, and the official handling to the job summary. It SHALL annotate the delta spec file, SHALL fail the step, and SHALL fail closed when the bundled CLI cannot be executed or its projection cannot be read or parsed.

#### Scenario: A blocking entry is reported

- **WHEN** the gate finds one blocking entry
- **THEN** the job summary lists the entry and the official handling
- **AND** the delta spec file carries an annotation
- **AND** the step exits nonzero

#### Scenario: The bundled CLI is unavailable

- **WHEN** the gate cannot execute the bundled CLI
- **THEN** it reports the failure and exits nonzero

#### Scenario: The projection cannot be parsed

- **WHEN** the CLI output is not a readable change or spec projection
- **THEN** it reports the failure and exits nonzero
