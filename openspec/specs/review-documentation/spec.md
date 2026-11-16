# review-documentation Specification

## Purpose
Defines the single user-facing review document and the checks that keep it aligned with the plugin's tools, configuration and record layout.

## Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe, in one place: the purpose of review, the draft and apply objects, the phase boundaries, reviewer modes 0 and 1, the policy lock, the reviewer model sources (`inherit` and `explicit`) and the configuration page, the report and finding contract, severity, verdict, readiness, records, failure handling, configuration, and the no-git exception for apply review, including the `policy`/`enabled`/`available` status fields and the no-policy case.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains both review types and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that draft review uses the change artifacts and apply review uses the committed git tree

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for draft review
- **AND** it states that a git project seals the draft with a commit that contains the change directory and its OpenSpec ignore file
- **AND** it states that `openspec_archive` waits for apply review when the review is enabled and the project has git, and proceeds without it otherwise

#### Scenario: The document explains the phase boundary

- **WHEN** the reader reaches the phase boundary
- **THEN** it states that the draft review can be resumed before apply started and cannot be resumed after
- **AND** it states that a plan change during apply needs the user's written waiver

#### Scenario: The document explains the no-git exception

- **WHEN** the reader reaches the apply object section
- **THEN** it states that a new policy created by this plugin in a project without git locks apply review disabled
- **AND** it states that a legacy policy may still record apply review enabled but status reports it unavailable
- **AND** it states that a change with no policy reports `policy: false` and archive does not wait

#### Scenario: The document explains the status fields

- **WHEN** the reader reaches the status description
- **THEN** it explains `policy`, `enabled` and `available`, including that unavailable takes precedence over an unset policy

#### Scenario: The document explains the frozen reviewer

- **WHEN** the reader reaches the reviewer section
- **THEN** it states that the reviewer runs the installed plugin artifact
- **AND** it states that editing plugin sources does not change the installed copy or reload the reviewer
- **AND** it states that new plugin logic takes effect only after a reinstall

### Requirement: The document names the live tools and actions

The document SHALL name `openspec_review`, `openspec_reviewer`, their actions, `openspec_apply_next` and `openspec_archive` exactly as registered. It SHALL NOT name a removed tool or an OpenSpec CLI command.

#### Scenario: Tools are checked

- **WHEN** the documentation test reads the tool registrations
- **THEN** every tool named in the document exists and every action is in the live schema

#### Scenario: A removed tool is documented

- **WHEN** the document names a tool or action that is not registered
- **THEN** the documentation test fails

### Requirement: The document matches configuration defaults

The document SHALL list the review config keys and their defaults: draft enabled true, reviewers 0, maxRounds 3, waitMinutes 15; apply enabled true, reviewers 0, maxRounds 5, waitMinutes 15; reviewer model inherit.

#### Scenario: A default changes

- **WHEN** a contributor changes a review default in the code
- **THEN** the documentation test fails until `docs/review.md` is updated

#### Scenario: A key is renamed

- **WHEN** a config key is renamed in the code
- **THEN** the documentation test names the stale key

### Requirement: The document matches the record layout

The document SHALL state the review root `openspec/.review/<store>#<change>/`, the draft and apply record files, and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

### Requirement: README links the document

The README SHALL link `docs/review.md` from its review section.

#### Scenario: The link is missing

- **WHEN** the README loses the link
- **THEN** the documentation test fails

### Requirement: The document states the reviewer boundary and validation owner

`docs/review.md` SHALL state that the independent reviewer's model-facing catalog contains `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`, with `read_image` conditional on the Host `attachments` service; that inherited Host tools are masked; and that apply review start and resume run strict validation, with the result carried in the brief. It SHALL NOT claim that the reviewer validates the change itself.

#### Scenario: Document names the reviewer catalog

- **WHEN** `docs/review.md` is read
- **THEN** it lists only the seven reviewer tools, conditions `read_image` on the `attachments` service, and says inherited Host tools are masked

#### Scenario: Document names the image-read prerequisites

- **WHEN** `docs/review.md` describes `read_image`
- **THEN** it states the Host `attachments` service and an image-capable route are required

#### Scenario: Document names the validation owner

- **WHEN** the review document describes apply review
- **THEN** it says the plugin runs strict validation at start or resume and the brief carries the result

### Requirement: The document describes batch disposition

`docs/review.md` SHALL state that finding `dispose` and `waive` accept `dispositions` for several findings in one call, that the batch is atomic, that the single `id` form remains, that a plan-change `waive` takes `files` and not `dispositions`, and that `deferred` needs a note because the old `issue` field is no longer accepted and old records keep it.

#### Scenario: Document names the batch parameter

- **WHEN** the review document is read
- **THEN** it shows a `dispositions` example and states that one call can dispose several findings
- **AND** it keeps a single-`id` example

#### Scenario: Document states the atomic rule

- **WHEN** the review document describes a batch
- **THEN** it states that an invalid entry leaves every finding unchanged

#### Scenario: Document states the deferred rule

- **WHEN** the review document describes `deferred`
- **THEN** it requires a note
- **AND** it states that the old `issue` field is no longer accepted and old records keep it

#### Scenario: Document separates the plan-change waiver

- **WHEN** the review document describes `waive`
- **THEN** it states that a plan-change waiver takes `files` and not `dispositions`
