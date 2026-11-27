# review-configuration Specification

## Purpose
Defines the review settings page and its Host surface: how review policy is configured, how reviewer models are discovered and validated, which project facts the page reports, and how saved settings interact with the per-change lock.

## Requirements

### Requirement: Reviewer model selection is explicit or inherited

Each review profile SHALL carry a reviewer model with `source`. With `source: "explicit"` the profile SHALL carry a non-empty `provider` and `model`, and `reasoningEffort` when that model exposes selectable reasoning efforts. The page SHALL show each profile's model as a read-only summary.

#### Scenario: Inherit is selected

- **WHEN** a profile carries `reviewerModel` with `source: "inherit"`
- **THEN** policy locking resolves it to the changer's current provider, model and effort

#### Scenario: An explicit model is selected

- **WHEN** a profile carries `source: "explicit"` with a provider, model and optional effort
- **THEN** policy locking stores that route without reading the changer's selection

#### Scenario: The selected model exposes no efforts

- **WHEN** a profile's explicit model exposes no selectable reasoning efforts
- **THEN** the profile carries no `reasoningEffort` and locking accepts it

#### Scenario: The model list is unavailable

- **WHEN** a caller reads the model catalog and the Host cannot reach the provider list
- **THEN** the Host reports the failure to that caller, and the read-only page, which does not use the catalog, is unaffected

### Requirement: The Host serves the page

The plugin SHALL expose Host methods for providers, models, reasoning efforts, the project review configuration and the project facts of locked changes. The methods SHALL be served by the plugin itself rather than by a Session, and reading them SHALL NOT activate a Session. The Host SHALL NOT expose a review settings update.

#### Scenario: Providers are read

- **WHEN** the page requests providers
- **THEN** the Host returns the authorized provider list

#### Scenario: Models are read for a provider

- **WHEN** the page requests models for a provider
- **THEN** the Host returns that provider's models

#### Scenario: Efforts are read for a model

- **WHEN** the page requests efforts for a provider and model
- **THEN** the Host returns the supported efforts and the default

#### Scenario: Project facts are read

- **WHEN** the page requests the project summary
- **THEN** the Host returns every project it knows, each with its git availability, its review configuration or its schema error, and the review sections of its locked changes

### Requirement: Locked policies are visible and immutable from the page

The page SHALL show, for every project the Host knows, a summary of that project's locked change policies, and SHALL state that editing the project review file affects only changes created afterwards. A project is a working directory of a live agent that holds an `openspec/` root. `reviewPolicies.list` SHALL return each locked change's entry sections and pipeline without returning review reports or findings.

#### Scenario: A locked change is shown

- **WHEN** the page opens and the Host knows a project with locked changes
- **THEN** it lists those changes' entry locks and pipeline under that project

#### Scenario: An extra entry is shown

- **WHEN** a locked policy carries a `pr` entry
- **THEN** the page shows that entry with its object and locked parameters

#### Scenario: Settings are edited after locking

- **WHEN** the project review file changes after a change is locked
- **THEN** that change's policy is unchanged and the page states the boundary

### Requirement: The page reports git availability per project

The page SHALL report every tree entry as unavailable for a project whose working tree has no git repository, and SHALL report every directory entry for every project regardless of git. `reviewPolicies.list` SHALL report each project's git availability.

#### Scenario: A project has no git

- **WHEN** the Host reports a project without git
- **THEN** the page marks each tree entry unavailable
- **AND** it still shows each directory entry

#### Scenario: A project has git

- **WHEN** the Host reports a project with git
- **THEN** the page reports every declared entry as available

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

### Requirement: Profiles declare an object type and entries name a profile

`profiles` SHALL map a name to an `object` type plus review parameters, where `object` is `directory` or `tree`. `reviews` SHALL map an entry name to a declared profile; entry names SHALL be kebab-case and SHALL NOT be limited to `draft` and `apply`. The entry name SHALL NOT select the flow; each entry's profile `object` does. The pipeline roles SHALL constrain the object: `beforeApply` a directory entry and `beforeArchive` a tree entry. An entry naming an absent profile SHALL be refused.

#### Scenario: Both entries resolve

- **WHEN** the file declares a directory profile for `reviews.draft`, a tree profile for `reviews.apply` and omits `pipeline`
- **THEN** the directory entry locks the directory parameters and the tree entry the tree parameters

#### Scenario: A draft entry names a tree profile

- **WHEN** `reviews.draft` names a profile whose `object` is `tree` and `pipeline` names a directory entry for `beforeApply` and that tree entry for `beforeArchive`
- **THEN** the read accepts it and the entry runs the tree review flow

#### Scenario: An entry outside draft and apply is accepted

- **WHEN** the file declares a directory `reviews.draft`, a tree `reviews.pr` and `pipeline` with `beforeApply: "draft"` and `beforeArchive: "pr"`
- **THEN** the read accepts `pr` as an entry and the entry runs the tree review flow

#### Scenario: An entry is absent

- **WHEN** the file omits `reviews.draft` or `reviews.apply` and omits `pipeline`
- **THEN** the read fails and names the missing default entry

#### Scenario: An unknown entry appears

- **WHEN** the file declares a directory `reviews.draft`, a tree `reviews.apply` and an invalid `reviews.PR` key
- **THEN** the read fails and names the unsupported entry

#### Scenario: A profile is unset

- **WHEN** the file declares a directory `reviews.draft`, a tree `reviews.apply` and `reviews.pr` naming a profile that `profiles` does not declare
- **THEN** the read fails and names the missing profile

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

### Requirement: A legacy row-config reviews section is ignored and reported

The plugin row config SHALL load normally while it still carries a `reviews` section, and that section SHALL NOT supply review parameters. The first review read and change creation SHALL report that the section is ignored and must move to the project review file.

#### Scenario: The row config still carries reviews

- **WHEN** the profile's plugin row config carries a `reviews` section and the project review file is valid
- **THEN** the plugin loads, reads the project file, and the first review read reports the ignored section

#### Scenario: The row config carries no reviews

- **WHEN** the profile's plugin row config carries no `reviews` section
- **THEN** no migration report is returned

### Requirement: Pipeline names the lifecycle gate entries

The project review file SHALL accept an optional top-level `pipeline` object with only `beforeApply` and `beforeArchive`. `beforeApply` SHALL name a declared entry whose profile `object` is `directory`; `beforeArchive` SHALL name a declared entry whose `object` is `tree`. Omitted values SHALL default to `draft` and `apply`. An unknown key, a non-string value, an absent entry or a wrong object type SHALL fail the read and name the field and the expected object.

#### Scenario: The default pipeline resolves

- **WHEN** the file declares a directory profile for `reviews.draft`, a tree profile for `reviews.apply` and omits `pipeline`
- **THEN** `beforeApply` resolves to `draft` and `beforeArchive` to `apply`
- **AND** `draft` is a directory entry and `apply` a tree entry

#### Scenario: An explicit pipeline names another entry

- **WHEN** the file declares a directory `reviews.draft`, a tree `reviews.pr` and `pipeline` with `beforeArchive: "pr"`
- **THEN** the archive gate resolves to `pr` and `beforeApply` keeps its default `draft`

#### Scenario: A beforeApply entry is not a directory entry

- **WHEN** `pipeline.beforeApply` names an entry whose profile `object` is `tree`
- **THEN** the read fails and names the entry and the required `directory` object

#### Scenario: A beforeArchive entry is not a tree entry

- **WHEN** `pipeline.beforeArchive` names an entry whose profile `object` is `directory`
- **THEN** the read fails and names the entry and the required `tree` object

#### Scenario: An unknown pipeline key is refused

- **WHEN** `pipeline` carries a key other than `beforeApply` or `beforeArchive`
- **THEN** the read fails and names that key

#### Scenario: A pipeline value names an absent entry

- **WHEN** `pipeline.beforeArchive` names an entry that `reviews` does not declare
- **THEN** the read fails and names the entry

#### Scenario: A pipeline value is not a string

- **WHEN** `pipeline.beforeApply` is a number or an object
- **THEN** the read fails and names the `beforeApply` field

#### Scenario: The pipeline is not an object

- **WHEN** `pipeline` is an array or a string
- **THEN** the read fails and names `pipeline`
