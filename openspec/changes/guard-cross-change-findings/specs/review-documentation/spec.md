# Spec Delta

## ADDED Requirements

### Requirement: The review document states the cross-change boundary

`docs/review.md` SHALL state that another change's artifacts are outside a review's finding scope, that a concern about another change belongs in `outOfScope`, that a change whose draft round has no report must not be asked to edit its artifacts, and that the plugin refuses a finding whose location names another change.

#### Scenario: The document states the finding boundary

- **WHEN** a reader reaches the report and finding contract
- **THEN** the document states that another change's artifacts are outside the finding scope

#### Scenario: The document states the refusal

- **WHEN** a reader looks for what happens to a cross-change finding
- **THEN** the document states that the report is refused and the concern belongs in `outOfScope`

#### Scenario: The document states the open-round rule

- **WHEN** a reader reaches the cross-change boundary
- **THEN** the document states that a change whose draft round has no report must not be asked to edit its artifacts
