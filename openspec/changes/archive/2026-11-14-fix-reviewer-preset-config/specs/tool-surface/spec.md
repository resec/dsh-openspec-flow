# Spec Delta

## ADDED Requirements

### Requirement: The reviewer preset activates on the pinned runtime

The `openspec-reviewer` preset SHALL activate on the DSH runtime pinned by the plugin's `engines.dsh`, with the read-only file and search tools it declares. Each child tool's configuration SHALL satisfy that runtime's required fields, so an independent reviewer can start.

#### Scenario: Independent reviewer starts

- **WHEN** a change's policy sets `reviewers: 1` and the plugin runs on the pinned DSH runtime
- **THEN** the reviewer preset activates and the reviewer session starts

#### Scenario: A required tool setting is missing

- **WHEN** a preset child tool omits a field its pinned runtime requires
- **THEN** preset activation fails before the reviewer session starts
