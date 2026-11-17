# Spec Delta: review-documentation

## MODIFIED Requirements

### Requirement: The document matches configuration defaults

The document SHALL list the review config keys and their defaults: draft enabled true, reviewers 0, waitMinutes 15; apply enabled true, reviewers 0, waitMinutes 15; reviewer model inherit. It SHALL state that draft and apply reviews have no round cap and that no round-cap key exists.

#### Scenario: A default changes

- **WHEN** a contributor changes a review default in the code
- **THEN** the documentation test fails until `docs/review.md` is updated

#### Scenario: A key is renamed

- **WHEN** a config key is renamed in the code
- **THEN** the documentation test names the stale key

#### Scenario: A round cap is documented

- **WHEN** the document lists a `maxRounds` key or a round-cap default
- **THEN** the documentation test fails

### Requirement: The document matches the record layout

The document SHALL state the review root `openspec/.review/<store>#<change>/`, the draft and apply record files, the review-card marker those records carry, the apply lock locations (the implementation domain's worktree git directory or `openspec/.review/`, plus a store change's store domain) with their `schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot` and `startedAt` fields, and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports

#### Scenario: The card marker is documented

- **WHEN** a review record gains or loses its card marker field
- **THEN** the documentation test fails until `docs/review.md` describes the field

## ADDED Requirements

### Requirement: The document explains the card surface

The document SHALL explain the `plugin:openspec-flow/review-card` record, the `openspecReviewCards` projection, the `conversation.chat.turnTail` rendering, the collapsed summary, the fixed Chinese labels, the complete expanded report, the plan-change waiver section, the write points, the no-truncation rule and the fact that the record is not model-visible.

#### Scenario: A reader opens the review document

- **WHEN** a reader reaches the review-card section
- **THEN** it names the record, the projection and the turn-tail rendering
- **AND** it states that the expanded card contains the full report body and the plan-change waiver
- **AND** it states that the record is not model-visible

#### Scenario: A write point changes

- **WHEN** a card write point is added or removed in code
- **THEN** the documentation test fails until the document lists the new set

### Requirement: The document states the model reporting rule

The document SHALL state that the plugin instructs the model, through the shipped skills, the reviewer brief and the policy text, to write only a short note for information the report cannot express and the user must know, not to restate the report, and that the reviewer brief instructs the reviewer to write no summary after submitting.

#### Scenario: The model rule is documented

- **WHEN** a reader reaches the model behavior section
- **THEN** it states the short-note rule
- **AND** it states that the reviewer brief forbids a summary
