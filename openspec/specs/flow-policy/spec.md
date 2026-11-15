# flow-policy Specification

## Purpose
Defines the standing OpenSpec workflow rule the plugin adds to an agent's system prompt, and the project scoping that keeps it out of projects that do not use OpenSpec.

## Requirements

### Requirement: OpenSpec projects receive the flow rule

The plugin SHALL register a system prompt section for an agent whose current working directory is inside an OpenSpec project. The section SHALL state the workflow stage gates that apply to non-trivial work in that project.

#### Scenario: An agent works in an OpenSpec project

- **WHEN** an agent is created and its working directory contains an `openspec/` root
- **THEN** that agent's assembled system prompt contains the OpenSpec flow rule

#### Scenario: The rule states the stage gates

- **WHEN** the rule is present
- **THEN** it requires clarifying the request before proposing, confirming the change name and scope before creating a change, applying through `openspec_apply_next` and `openspec_mark_task_done`, validating with `openspec_validate` before completion, and archiving only on an explicit user request

### Requirement: Other projects receive no rule

The plugin SHALL NOT add the flow rule to an agent whose working directory has no OpenSpec root.

#### Scenario: An agent works outside OpenSpec

- **WHEN** an agent's working directory has no `openspec/` root
- **THEN** its assembled system prompt contains no OpenSpec flow section

### Requirement: The rule follows the working directory

The plugin SHALL evaluate project membership at each prompt assembly rather than only when the agent is created.

#### Scenario: The agent leaves an OpenSpec project

- **WHEN** an agent with the rule switches to a directory without an `openspec/` root
- **THEN** the next assembled system prompt omits the rule

#### Scenario: The agent returns to an OpenSpec project

- **WHEN** an agent without the rule switches back to a directory with an `openspec/` root
- **THEN** the next assembled system prompt contains the rule

### Requirement: Existing agents are covered at load time

The plugin SHALL attach the rule to agents that already exist when it loads, in addition to agents created later.

#### Scenario: The plugin reloads with a live agent

- **WHEN** the plugin starts while an OpenSpec-project agent is already live
- **THEN** that agent receives the rule without being recreated

### Requirement: Attachment is idempotent

The plugin SHALL register at most one flow section per agent.

#### Scenario: An agent is seen by both attachment paths

- **WHEN** the same agent is reachable through both the creation event and the load-time sweep
- **THEN** the plugin registers one section for that agent

### Requirement: The flow rule names only the tools

The registered flow rule SHALL name the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback.

#### Scenario: The rule is assembled

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow section contains no `CLI` token and no fallback sentence

#### Scenario: The rule text is edited

- **WHEN** a contributor changes `POLICY_TEXT` so that it names the CLI
- **THEN** `node --test test/` fails

### Requirement: The flow rule refuses sync-only work

The registered flow rule SHALL state that main specs are updated only by `openspec_archive`, that there is no sync-only flow, and that editing main specs outside archiving is unsupported.

#### Scenario: The user asks to update main specs without archiving
- **WHEN** an agent subject to the rule receives a request to update main specs without archiving the change
- **THEN** the rule says the flow is unsupported and points to archiving after the change is complete

### Requirement: The flow rule names the management gate

The registered flow rule SHALL state that `openspec_init`, `openspec_store_list` and `openspec_schemas` require the user to run `/opsx-admin`, and SHALL direct the agent to ask for that command instead of reporting those tools as missing.

#### Scenario: The rule is assembled

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow section names `/opsx-admin` and the three management tools as gated

#### Scenario: The agent needs a management tool

- **WHEN** the agent needs to initialize a project, list stores or list schemas without the block open
- **THEN** the rule directs it to ask the user to run `/opsx-admin` and to continue only after the tool appears

#### Scenario: The rule is checked at prompt assembly

- **WHEN** the test suite reads the registered flow section
- **THEN** the section still contains no `CLI` token and no command fallback for the core flow

### Requirement: The flow rule states the draft review gate

The registered flow rule SHALL require a draft review before apply when the change enables it. It SHALL state that the draft review object is the change artifacts and the intent, that `reviewers: 0` means the changer writes the report, that `openspec_apply_next` refuses a change whose review is not ready, that a git project seals the draft with a commit that contains the change directory and its OpenSpec ignore file, and that the draft review cannot be resumed once apply started.

#### Scenario: Draft review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables draft review
- **THEN** the flow rule names `openspec_review` and the draft review gate before apply

#### Scenario: Draft review is disabled

- **WHEN** the change policy disables draft review
- **THEN** the flow rule does not require a draft review for that change

#### Scenario: The rule does not require a commit for draft review

- **WHEN** the flow rule describes the draft review object
- **THEN** it states that the draft object is the change artifacts, not a git tree or commit

#### Scenario: The rule names the seal

- **WHEN** the flow rule is registered for an OpenSpec project
- **THEN** it states that a git project seals the draft with a commit that contains the change directory and its OpenSpec ignore file
- **AND** it states that apply refuses an unsealed or mixed commit

#### Scenario: The rule freezes the draft after apply

- **WHEN** the flow rule describes the draft gate
- **THEN** it states that the draft review cannot be resumed after apply started

### Requirement: The flow rule states the apply review gate

The registered flow rule SHALL require an apply review before archive when the change enables it and the project has git. It SHALL state the apply object is the committed git tree, the working tree must be clean, a no-git project has no apply review, archive proceeds when the review is disabled or unavailable, and a plan change during apply needs a recorded user waiver reviewed by apply review.

#### Scenario: Apply review is enabled

- **WHEN** an OpenSpec-project agent's system prompt is assembled and the change enables apply review
- **THEN** the flow rule names `openspec_review` and the apply review gate before `openspec_archive`

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** the flow rule does not require an apply review

#### Scenario: The project has no git

- **WHEN** the project has no git repository
- **THEN** the flow rule states that apply review is unavailable and archive does not wait for it

#### Scenario: The rule names the plan-change waiver

- **WHEN** the flow rule describes the apply gate
- **THEN** it states that a plan change during apply needs the user's written waiver
- **AND** it states that apply review reviews the changed planning artifacts

### Requirement: The rule states the independent reviewer mode

The flow rule SHALL state that `reviewers: 1` starts one independent reviewer, that the changer waits for its report, and that the reviewer is read-only and cannot edit the worktree.

#### Scenario: Reviewers is one

- **WHEN** the change policy sets `reviewers: 1`
- **THEN** the flow rule tells the changer to start the review and wait for the reviewer

#### Scenario: Reviewers is zero

- **WHEN** the change policy sets `reviewers: 0`
- **THEN** the flow rule keeps the self-review path
