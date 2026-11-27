# Spec Delta

## MODIFIED Requirements

### Requirement: The project review file supplies every review parameter

The plugin SHALL read review parameters from `openspec/reviews.json`, except when the first locking call supplies `configPath` or `reviewEnabled` is false. The file SHALL be JSON. A missing, unreadable, unparsable or schema-invalid file SHALL fail the locking call and name its path and the offending field. The plugin SHALL NOT fall back to defaults for a required parameter; `passCriteria`, `allowDeferred` and `allowRejected` are optional and default to `major`, `true` and `true`.

#### Scenario: The file is present and valid

- **WHEN** a change is created in a project whose review file is valid
- **THEN** its policy carries the file's parameters

#### Scenario: The file is missing

- **WHEN** a review read runs in a project without `openspec/reviews.json` and no `configPath`
- **THEN** the call fails and names the expected path

#### Scenario: The file cannot be parsed

- **WHEN** the file contains invalid JSON
- **THEN** the call fails and names the path and the parse error

#### Scenario: A field is invalid

- **WHEN** a profile carries an unsupported value
- **THEN** the call fails and names the profile, the field and the accepted bound

#### Scenario: A locking call supplies another path

- **WHEN** the first locking call supplies `configPath`
- **THEN** the plugin reads that file and does not read the project file

#### Scenario: The review switch is off

- **WHEN** `reviewEnabled` is false and a change is created
- **THEN** no policy is locked and no review file is read

#### Scenario: An optional parameter is omitted

- **WHEN** a profile omits `passCriteria`, `allowDeferred` and `allowRejected`
- **THEN** the read succeeds and the resolved profile carries `major`, `true` and `true`

#### Scenario: An optional parameter is invalid

- **WHEN** a profile carries `passCriteria: "blocker"` or a non-boolean `allowDeferred` or `allowRejected`
- **THEN** the read fails and names the profile and the offending field

### Requirement: Review parameters keep their bounds

A profile SHALL accept `object` (`directory` or `tree`), `enabled` (boolean), `reviewers` (0 or 1), `waitMinutes` (an integer from 1 to 120), `reviewerModel`, and optional `passCriteria` (`critical`, `major`, `minor` or `nit`), `allowDeferred` (boolean) and `allowRejected` (boolean). It SHALL require the first five, default the optional three, and refuse every other key, including a round cap.

#### Scenario: Reviewers exceeds the bound

- **WHEN** a profile carries `reviewers: 2`
- **THEN** the read fails and reports the accepted range

#### Scenario: A round cap appears

- **WHEN** a profile carries `maxRounds`
- **THEN** the read fails and names the unsupported key

#### Scenario: The wait limit is below the bound

- **WHEN** a profile carries `waitMinutes: 0`
- **THEN** the read fails and reports the accepted range

#### Scenario: A parameter is missing

- **WHEN** a profile omits `reviewers`
- **THEN** the read fails and names the missing parameter instead of supplying a default

#### Scenario: The pass criteria is outside the enum

- **WHEN** a profile carries `passCriteria: "highest"`
- **THEN** the read fails and names the field and the accepted values

#### Scenario: A disposition switch is not a boolean

- **WHEN** a profile carries `allowDeferred: "yes"`
- **THEN** the read fails and names the field

#### Scenario: The optional parameters are omitted

- **WHEN** a profile omits the three optional parameters
- **THEN** the resolved profile carries `major`, `true` and `true`

### Requirement: The read-only configuration page registers and reports

The plugin SHALL register a Client configuration page at `plugins.row.config` for `dsh-openspec-flow#openspec-flow`. The page SHALL present the `reviewEnabled` switch, each project's profiles, entries, pipeline, schema errors and locked policies, and SHALL offer no control that writes review configuration.

#### Scenario: The page opens

- **WHEN** the user opens the plugin's configuration page
- **THEN** it shows the switch and each project's configuration without a save control

#### Scenario: A project file is invalid

- **WHEN** a project's review file fails validation
- **THEN** the page shows the file path and the offending field

#### Scenario: The pipeline is shown

- **WHEN** a project's file declares a pipeline
- **THEN** the page shows `beforeApply` and `beforeArchive` and the entries they name

#### Scenario: No save path exists

- **WHEN** the page renders
- **THEN** it calls no configuration editor and offers no save action

#### Scenario: The switch is off

- **WHEN** `reviewEnabled` is false
- **THEN** the page still reports each project's file state, and the read locks nothing

#### Scenario: A profile carries pass criteria and switches

- **WHEN** a profile declares `passCriteria`, `allowDeferred` and `allowRejected`
- **THEN** the page shows all three values for that profile
