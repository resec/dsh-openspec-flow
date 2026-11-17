# Spec Delta: review-documentation

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The document qualifies dispositions with the review kind

`docs/review.md` SHALL state that `dispose` and a finding `waive` name their review kind explicitly, that a draft record refuses both once apply started, and that every dispose example and every stated dispose next action carries the kind.

#### Scenario: Document states the review kind

- **WHEN** the review document describes `dispose` and a finding `waive`
- **THEN** it states that `review` is required
- **AND** it names `draft` and `apply`

#### Scenario: Document states the draft freeze

- **WHEN** the review document describes a draft disposition after apply started
- **THEN** it states that the draft record refuses `dispose` and a finding `waive`

#### Scenario: Examples and next actions carry the kind

- **WHEN** the review document shows a dispose example or names a dispose next action
- **THEN** the example passes `review` and the stated next action carries `review=<kind>`

### Requirement: The README states the disposition kind and the freeze

The README review section SHALL state that `dispose` and a finding `waive` require the review kind, that a draft record refuses both once apply started, and SHALL name the kind-qualified dispose next action instead of the unqualified one. The documentation test SHALL assert both sentences and the qualified next action in the README.

#### Scenario: README states both rules

- **WHEN** the README review section is read
- **THEN** it states that the review kind is required for a disposition
- **AND** it states that a draft record refuses a disposition once apply started

#### Scenario: README names the qualified next action

- **WHEN** the README states the next action after an open finding
- **THEN** the action carries `review=<kind>`

#### Scenario: The test fails on a missing README sentence

- **WHEN** the README drops either sentence or the qualified next action
- **THEN** the documentation test fails and names the README
