# Spec Delta: review-documentation

## ADDED Requirements

### Requirement: The document states the refined card display

`docs/review.md` SHALL state that the collapsed summary counts findings by severity and shows no next action, that unrecorded optional finding and disposition rows are omitted, and that same-state readiness reasons are merged into one line.

#### Scenario: A reader reaches the refined card description

- **WHEN** a reader reads the card section of `docs/review.md`
- **THEN** the document states the per-severity summary without a next action
- **AND** it states that unrecorded optional rows are omitted
- **AND** it states that same-state readiness reasons are merged
