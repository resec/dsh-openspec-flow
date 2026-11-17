# review-configuration Specification

## Purpose
Defines the review settings page and its Host surface: how review policy is configured, how reviewer models are discovered and validated, which project facts the page reports, and how saved settings interact with the per-change lock.

## Requirements

### Requirement: The configuration page edits both reviews

The plugin SHALL register a Client configuration page at `plugins.row.config` for `dsh-openspec-flow#openspec-flow`. The page SHALL edit the draft and apply review sections independently: enabled, reviewers (0 or 1), waitMinutes and reviewerModel. The page SHALL NOT offer a round-cap setting, and its bounds SHALL carry only the reviewer count and the wait limit.

#### Scenario: The page opens

- **WHEN** the user opens the plugin's configuration page
- **THEN** it shows separate draft and apply sections

#### Scenario: Reviewers is edited

- **WHEN** the user selects 0 or 1 reviewers
- **THEN** the page saves that value in the review section

#### Scenario: A review is disabled

- **WHEN** the user disables one review
- **THEN** only that section changes

#### Scenario: No round cap is offered

- **WHEN** the page renders a review section
- **THEN** it shows no maxRounds field and reports no maxRounds bound

### Requirement: Reviewer model selection is explicit or inherited

Each review section SHALL carry a reviewer model with `source`. With `source: "explicit"` the section SHALL carry a non-empty `provider` and `model`, and `reasoningEffort` when that model exposes selectable reasoning efforts. The page SHALL offer an inherit option and cascade provider, model and effort selectors for an explicit choice.

#### Scenario: Inherit is selected

- **WHEN** the user chooses inherit
- **THEN** the page stores `source: "inherit"` and does not require provider, model or effort

#### Scenario: An explicit model is selected

- **WHEN** the user selects a provider, model and effort
- **THEN** the page stores them with `source: "explicit"`

#### Scenario: The selected model exposes no efforts

- **WHEN** the selected model exposes no selectable reasoning efforts
- **THEN** the page stores `source: "explicit"` with the provider and model and no `reasoningEffort`, and the Host accepts the save

#### Scenario: The model list is unavailable

- **WHEN** the Host cannot read the model catalog
- **THEN** the page keeps the previous values and reports the failure

### Requirement: The Host serves the page

The plugin SHALL expose Host methods for providers, models, reasoning efforts, current settings, a settings update and the project facts of locked changes. The methods SHALL be served by the plugin itself rather than by a Session, and reading them SHALL NOT activate a Session.

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

- **WHEN** the page requests the locked-policy summary
- **THEN** the Host returns every project it knows, each with that project's git availability and the review sections of its locked changes

### Requirement: Saving validates the complete config

`reviewSettings.update` SHALL validate the complete candidate with the plugin Config schema, then verify an explicit reviewer model against the catalog, before calling the configuration editor. It SHALL reject an unknown field, an invalid reviewer count, an invalid wait limit, or an unavailable provider, model or effort. A legacy `maxRounds` is accepted, ignored and saved without it. A rejected save SHALL leave the existing config unchanged.

#### Scenario: Valid settings are saved

- **WHEN** the page saves a valid candidate
- **THEN** the configuration editor receives the complete config

#### Scenario: An invalid reviewer count is saved

- **WHEN** the user saves reviewers 2
- **THEN** the Host rejects the save and returns the reason

#### Scenario: A legacy round cap is dropped

- **WHEN** a settings payload still carries a review section's `maxRounds`
- **THEN** the Host accepts the save and persists the section without `maxRounds`

#### Scenario: An unavailable model is saved

- **WHEN** the user saves an explicit model that the catalog does not contain
- **THEN** the Host rejects the save

### Requirement: Locked policies are visible and immutable from the page

The page SHALL show, for every project the Host knows, a summary of that project's locked change policies, and SHALL state that editing settings affects only new changes. A project is a working directory of a live agent that holds an `openspec/` root. `reviewPolicies.list` SHALL return each locked change's review sections without returning review reports or findings.

#### Scenario: A locked change is shown

- **WHEN** the page opens and the Host knows a project with locked changes
- **THEN** it lists those changes' draft and apply locks under that project

#### Scenario: Settings are edited after locking

- **WHEN** the user saves a new default after a change is locked
- **THEN** that change's policy is unchanged

### Requirement: The page reports git availability per project

The page SHALL keep the draft settings editable in every project and SHALL report apply review as unavailable for a project whose working tree has no git repository. `reviewPolicies.list` SHALL report each project's git availability.

#### Scenario: A project has no git

- **WHEN** the Host reports a project without git
- **THEN** the page marks that project's apply review as unavailable and keeps its draft settings editable

#### Scenario: A project has git

- **WHEN** the Host reports a project with git
- **THEN** the page reports both reviews as available
