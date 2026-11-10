# skill-provider Specification

## Purpose
Defines how a session receives the plugin's packaged OpenSpec workflow skills: which names the provider offers, their precedence over project copies, and how bodies are loaded on demand without reading every document up front.

## Requirements

### Requirement: Provider exposes the packaged workflow skills

The plugin SHALL register one skill provider that offers the five packaged workflow skills and no entry-point skill.

#### Scenario: Session catalog is built
- **WHEN** an agent with the plugin's tools requests its skill catalog
- **THEN** the catalog contains `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change` and `openspec-update-change`, with no `openspec-flow` entry and no `openspec-sync-specs` entry

#### Scenario: Skill registry is unavailable
- **WHEN** the deployment has no `ctx.skills` registry or it lacks `registerProvider`
- **THEN** the provider is not registered, one warning names the missing capability, and every tool remains callable

### Requirement: Plugin skills outrank project copies

Provider candidates SHALL carry a rank below the filesystem provider's project ranks, so a same-named project skill does not hide the packaged text.

#### Scenario: Project holds a same-named copy
- **WHEN** a project has `.dsh/skills/openspec-apply-change/SKILL.md` from an earlier installation
- **THEN** the catalog and every load use the packaged document, not the project copy

#### Scenario: Plugin is upgraded
- **WHEN** the plugin version changes and the session restarts
- **THEN** the catalog and loads use the new packaged text without running `openspec_init`

### Requirement: Discovery reads frontmatter only

Listing the catalog SHALL read each package document's frontmatter and SHALL NOT read or return its instruction body.

#### Scenario: Catalog is listed
- **WHEN** the catalog is built
- **THEN** each entry carries the declared name and description, and no instruction body is read

#### Scenario: A skill is selected
- **WHEN** the model or the user selects one skill
- **THEN** exactly that skill's body is read and returned

### Requirement: Loaded bodies match the packaged documents

A loaded skill SHALL return the instruction body that follows its frontmatter, unchanged.

#### Scenario: The apply skill is loaded
- **WHEN** `openspec-apply-change` is loaded
- **THEN** the result starts with the document body and contains the `openspec_apply_next` and `openspec_mark_task_done` steps

### Requirement: A malformed document is skipped

A packaged document that fails validation SHALL be omitted with one warning, and SHALL NOT prevent the other skills or the plugin's tools from loading.

#### Scenario: One document is malformed
- **WHEN** a packaged skill has no frontmatter, no description, or a body-less document
- **THEN** that skill is absent from the catalog, one warning names it, the remaining skills are still catalogued, and every tool stays callable

### Requirement: Packaged skills are model and user invocable

Each provider candidate SHALL be available to both the model catalog and the user-facing command list.

#### Scenario: Invocation policy is read
- **WHEN** a consumer inspects a candidate's invocation policy
- **THEN** both `modelInvocable` and `userInvocable` are true

### Requirement: Packaged skills belong to the core block

All five packaged workflow skills SHALL stay in the model catalog and the user-facing command list whether or not the management block is open. No packaged skill SHALL be gated by that block.

#### Scenario: The block is closed

- **WHEN** a consumer lists the session skill catalog with the management block closed
- **THEN** all five packaged skills are present

#### Scenario: The block is open

- **WHEN** the user opens the management block
- **THEN** the skill catalog is unchanged
