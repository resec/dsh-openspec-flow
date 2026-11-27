# Spec Delta: review entry model

## MODIFIED Requirements

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

## ADDED Requirements

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
