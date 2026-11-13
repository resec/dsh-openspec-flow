# review-documentation Specification

## Purpose
Defines the single user-facing review document and the checks that keep it aligned with the plugin's tools, configuration and record layout.

## Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe, in one place: the purpose of review, the draft and apply objects, the phase boundaries, reviewer modes 0 and 1, the policy lock, the reviewer model sources (`inherit` and `explicit`) and the configuration page, the report and finding contract, severity, verdict, readiness, records, failure handling and configuration.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains both review types and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that draft review uses the change artifacts and apply review uses the committed git tree

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for draft review and `openspec_archive` waits for apply review

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
