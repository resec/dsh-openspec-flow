# Spec Delta

## MODIFIED Requirements

### Requirement: The document matches the record layout

The document SHALL state the legacy review root `openspec/.review/<store>#<change>/`, the draft/apply record files, the `cards/<sessionKey>-<phase>-<round>.json` layout with a short SHA-256 key, the `cards` marker, the `<reviewDir>/card-delivery.json` watermark, apply lock locations/fields (`schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot`, `startedAt`), and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports

#### Scenario: The card layout is documented

- **WHEN** the card file directory or name pattern changes
- **THEN** the documentation test fails until `docs/review.md` describes the new layout

### Requirement: The review document describes the review ignore write

`docs/review.md` SHALL state that `openspec/.gitignore` is written only when git does not ignore the legacy review directory, and that a non-git project keeps writing it.

#### Scenario: The review document describes the ignore behavior

- **WHEN** the document describes review records and `openspec/.gitignore`
- **THEN** it states that the ignore line is written only when git does not ignore the legacy review directory

#### Scenario: The review document describes the non-git behavior

- **WHEN** the document describes a project without git
- **THEN** it states that the ignore line is still written

#### Scenario: The review document describes the shared-root skip

- **WHEN** the document describes a git project's shared review root
- **THEN** it states that no `openspec/.gitignore` is written and no git check-ignore runs

## ADDED Requirements

### Requirement: The document states the shared review root

The document SHALL state the git review root `<git common dir>/openspec-flow/review/<store>#<change>/`, its nested-root suffix, the one-time copy marker, that a removed shared record is not restored, that legacy cards remain readable until the copy, and that the shared root writes no ignore file and runs no git check-ignore.

#### Scenario: The shared root is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the git common directory root and the legacy root

#### Scenario: The nested root suffix is documented

- **WHEN** a nested OpenSpec root uses a suffixed record name
- **THEN** the document states that suffix and why it exists

#### Scenario: The one-time copy is documented

- **WHEN** a legacy record exists at the old root
- **THEN** the document states that first access copies it once, writes a marker, and does not restore a removed shared record

#### Scenario: The legacy card fallback is documented

- **WHEN** cards still live under the legacy root and no shared record exists
- **THEN** the document states that the card reader reads them until the record is copied
