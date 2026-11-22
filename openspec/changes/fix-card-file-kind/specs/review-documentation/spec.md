# Spec Delta

## MODIFIED Requirements

### Requirement: The document matches the record layout

The document SHALL state the legacy review root `openspec/.review/<store>#<change>/`, the draft/apply record files, the `cards/<sessionKey>-<kind>-<phase>-<round>.json` layout with a short SHA-256 key and a `draft` or `apply` kind, the earlier kind-less name that stays readable, the `cards` marker, the `<reviewDir>/card-delivery.json` watermark, apply lock locations/fields (`schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot`, `startedAt`), and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports

#### Scenario: The card layout is documented

- **WHEN** the card file directory or name pattern changes
- **THEN** the documentation test fails until `docs/review.md` describes the new layout
