# Spec Delta: tool-surface

## MODIFIED Requirements

### Requirement: Review disposition accepts a batch

`openspec_review` SHALL expose a `dispositions` parameter for `action: "dispose"` and for `action: "waive"` without `scope: "plan-change"`: an array of objects that each name an `id` and that finding's disposition fields, with no other property. It SHALL keep the single `id` form and SHALL reject a call that supplies both. The result SHALL carry `dispositions`, one entry per disposed finding with its id and status.

#### Scenario: Batch parameter is exposed

- **WHEN** the tool schema is inspected
- **THEN** `dispositions` is an array of objects with `id` required

#### Scenario: Entry schema is closed

- **WHEN** the tool schema is inspected
- **THEN** each entry permits only `id`, `status`, `note`, `waiver` and `approvedBy`

#### Scenario: Plan-change waiver rejects a batch

- **WHEN** a caller supplies `scope: "plan-change"` with `dispositions`
- **THEN** the call fails before any write

#### Scenario: Single form remains

- **WHEN** a caller disposes one finding with the `id` form
- **THEN** the call succeeds and the result carries its `dispositions` entry

#### Scenario: Both forms are rejected

- **WHEN** a caller supplies `id` and `dispositions` together
- **THEN** the call fails before any write

#### Scenario: Result lists the batch

- **WHEN** a call disposes two findings
- **THEN** the result names both ids and their final statuses

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start`, `resume`, `dispose` or a finding `waive` SHALL carry the review kind. It SHALL name `start` when the review has no record; `resume` when a record exists, no finding is open, and either the object differs or a finding is fixed; and `dispose` with the review kind while any finding is open. Once apply started, a draft next action SHALL name the apply review status, not `resume review=draft`.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose draft review has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded, no finding is open, and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record, no finding is open, and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`

#### Scenario: An open finding names dispose

- **WHEN** a draft record exists, the object changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose review=draft`
- **AND** it does not name `resume`

#### Scenario: An open apply finding names dispose

- **WHEN** an apply record exists, the tree changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose review=apply`
- **AND** it does not name `resume`

#### Scenario: Draft status after apply started names the apply review

- **WHEN** `status` for a draft review runs after apply started and the artifacts changed
- **THEN** the next action names the apply review
- **AND** it does not name a draft resume

## ADDED Requirements

### Requirement: Disposition actions name the review kind

`openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require the `review` parameter and SHALL reject a call that omits it before any write, naming `draft` and `apply`.

#### Scenario: Missing review kind is refused

- **WHEN** a caller supplies `dispositions` for `dispose` without `review`
- **THEN** the call fails before any write
- **AND** the error names `draft` and `apply`
