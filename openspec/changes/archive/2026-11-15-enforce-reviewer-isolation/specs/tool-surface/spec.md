# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow steps are exposed as tools

The plugin SHALL expose the core change-flow tools — inspect, apply, task marking, new change and archive — to every changer agent; the independent reviewer SHALL receive none of them. `openspec_inspect` SHALL carry the list, status, instructions, show, context and validate steps through its `action` parameter. The plugin SHALL expose the management tools — schemas, store list and init — only while the management block is open. Every exposed step SHALL be performed through an `openspec_*` tool.

#### Scenario: Agent runs a complete workflow

- **WHEN** a changer agent proposes, applies and archives a change in an OpenSpec project
- **THEN** every step is performed through an `openspec_*` tool and no `openspec` command is executed by the agent

#### Scenario: Out-of-scope command is requested

- **WHEN** the agent needs a command outside the tool surface, such as `config` or `workset`
- **THEN** the tool surface does not pretend to support it and the skill directs the agent to report the limitation

#### Scenario: Management tools are absent while the block is closed

- **WHEN** an agent's session has not opened the management block
- **THEN** its tool catalog contains no `openspec_init`, `openspec_store_list` or `openspec_schemas`, and a call to one of them fails as an unknown tool

#### Scenario: Management work runs after the block opens

- **WHEN** the user opens the management block and asks to initialize a project, list stores or list schemas
- **THEN** the agent calls the matching management tool in that turn

#### Scenario: Reviewer catalog excludes the core change-flow tools

- **WHEN** the reviewer's model-facing catalog is read
- **THEN** it contains none of `openspec_inspect`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_new_change` or `openspec_archive`

### Requirement: The reviewer preset is read-only

The `openspec-reviewer` preset SHALL compose only `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`. The reviewer entry SHALL deny every tool registered in the global Host scope by name, apart from those six preset names, leaving the preset tools visible; the changer's review, apply, task, archive, new-change and inspect tools, `issues_*` and `create_worktree` SHALL be absent. The preset SHALL NOT compose `bash`, `write`, `edit`, `subagent`, `workflow` or `openspec_review`. Activation SHALL fail when the initial deny set cannot be applied.

#### Scenario: Reviewer inspects its catalog

- **WHEN** the reviewer's model-facing catalog is read
- **THEN** it contains only `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`

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
