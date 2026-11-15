# Spec Delta: tool-surface

## MODIFIED Requirements

### Requirement: The reviewer preset is read-only

The `openspec-reviewer` preset SHALL compose `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`; `read_image` SHALL register only while the Host provides the `attachments` service. The reviewer entry SHALL deny every other global Host tool by name and keep the preset's registered tools visible. It SHALL NOT compose `bash`, `write`, `edit`, `subagent`, `workflow` or `openspec_review`. Activation SHALL fail when the initial deny set cannot be applied.

#### Scenario: Reviewer inspects its catalog

- **WHEN** the reviewer's model-facing catalog is read on a Host that provides the `attachments` service
- **THEN** it contains only `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`

#### Scenario: Reviewer calls an inherited Host tool

- **WHEN** the reviewer calls `openspec_review`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_new_change`, `openspec_inspect`, an `issues_*` tool or `create_worktree`
- **THEN** the call fails as an unknown tool and no handler runs

#### Scenario: Reviewer attempts to use an editing tool

- **WHEN** the reviewer attempts to call an editing, shell or delegation tool
- **THEN** the call fails as an unknown tool

#### Scenario: Host tool registered after activation

- **WHEN** a Host tool is registered after the reviewer entry has applied its deny set and the refresh writes its restriction
- **THEN** the refreshed reviewer catalog does not contain that tool and a call fails as an unknown tool

#### Scenario: Refresh restriction cannot be written

- **WHEN** the refresh cannot write its restriction for a newly registered Host tool
- **THEN** the entry logs a warning, the earlier deny set stays in force, and the next successful refresh denies the tool

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

#### Scenario: Restriction cannot be applied

- **WHEN** the reviewer entry cannot apply the initial deny set
- **THEN** the preset activation fails and no reviewer session starts

## ADDED Requirements

### Requirement: Reviewer image reads require deployment support

The reviewer's `read_image` SHALL be available only when the Host provides the `attachments` service; a call SHALL fail without changing the review when the step's route does not declare image input.

#### Scenario: Reviewer reads an image cited by the brief

- **WHEN** the brief cites an image path, the Host provides the `attachments` service, and the step's route declares image input
- **THEN** `read_image` is in the reviewer's tool surface and returns the image

#### Scenario: The Host has no attachments service

- **WHEN** the Host provides no `attachments` service
- **THEN** `read_image` is absent from the reviewer's tool surface, its other tools remain available, and the preset still activates

#### Scenario: The route cannot accept images

- **WHEN** the reviewer calls `read_image` on a step whose route does not declare image input
- **THEN** the call fails with an error, the review record is unchanged, and the reviewer keeps its other read tools
