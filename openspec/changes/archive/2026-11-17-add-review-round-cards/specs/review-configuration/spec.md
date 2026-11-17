# Spec Delta: review-configuration

## MODIFIED Requirements

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

### Requirement: Saving validates the complete config

`reviewSettings.update` SHALL validate the complete candidate with the plugin Config schema, then verify an explicit reviewer model's provider, model and reasoning effort against the model catalog, before calling the configuration editor. It SHALL reject an unknown field, an invalid reviewer count, an invalid wait limit, or a provider, model or effort the catalog does not offer. It SHALL accept a legacy review section that still carries `maxRounds`, ignore the field, and persist the section without it. A rejected save SHALL leave the existing config unchanged.

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
