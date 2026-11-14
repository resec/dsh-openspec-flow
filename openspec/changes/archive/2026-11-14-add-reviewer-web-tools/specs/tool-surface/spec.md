# Spec Delta

## MODIFIED Requirements

### Requirement: The reviewer preset is read-only

The `openspec-reviewer` preset SHALL compose `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`. It SHALL NOT compose `bash`, `write`, `edit`, `subagent`, `workflow` or the changer's `openspec_review`.

#### Scenario: Reviewer attempts to use an editing tool

- **WHEN** the reviewer's preset is inspected
- **THEN** it has no editing, shell or delegation tool

#### Scenario: Reviewer reads a spec

- **WHEN** the reviewer needs a main spec
- **THEN** the read and search tools are available

#### Scenario: Reviewer searches an external fact

- **WHEN** the brief names a fact without a URL and the provider selected for search is ready for the step's route
- **THEN** `web_search` is in the reviewer's tool surface

#### Scenario: Reviewer fetches a cited page

- **WHEN** the brief cites a page and the provider selected for fetch is ready for the step's route
- **THEN** `web_fetch` is in the reviewer's tool surface

#### Scenario: One selected provider is not ready

- **WHEN** the provider selected for one web operation cannot authenticate for the step's route
- **THEN** that tool is withheld, the other web tool remains available when its own provider is ready, and the preset stays active

### Requirement: The reviewer preset activates on the pinned runtime

The `openspec-reviewer` preset SHALL activate on the DSH runtime pinned by the plugin's `engines.dsh`, with the read-only file, search and web tools it declares. Each child tool's configuration SHALL satisfy that runtime's required fields, so an independent reviewer can start. The preset SHALL require the Host `web` service; a Host without it does not compose a reviewer session.

#### Scenario: Independent reviewer starts

- **WHEN** a change's policy sets `reviewers: 1`, the plugin runs on the pinned DSH runtime, and the Host provides the `web` service
- **THEN** the reviewer preset activates and the reviewer session starts

#### Scenario: A required tool setting is missing

- **WHEN** a preset child tool omits a field its pinned runtime requires
- **THEN** preset activation fails before the reviewer session starts

#### Scenario: The Host has no web service

- **WHEN** the Host provides no `web` service
- **THEN** the preset does not compose a reviewer session and its diagnostic stays on the preset roster

## ADDED Requirements

### Requirement: The reviewer preset chooses no web provider

The `openspec-reviewer` preset SHALL mount the web tool plugin without mounting a web service instance or a web provider, and SHALL NOT carry a provider selection key. `web_search` and `web_fetch` SHALL resolve the providers the deployment's Host web service selects for search and for fetch respectively.

#### Scenario: The preset is inspected

- **WHEN** the reviewer preset's plugin list is inspected
- **THEN** it contains the web tool plugin and no web service or provider entry

#### Scenario: The deployment selects the provider

- **WHEN** the reviewer calls `web_search` or `web_fetch`
- **THEN** the call uses the provider the deployment selected for that operation, not a provider named by the preset

#### Scenario: The deployment mixes providers

- **WHEN** the Host selects one provider for search and another for fetch
- **THEN** each web tool uses its own selected provider
