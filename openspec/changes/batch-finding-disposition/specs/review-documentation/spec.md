# Spec Delta

## ADDED Requirements

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
