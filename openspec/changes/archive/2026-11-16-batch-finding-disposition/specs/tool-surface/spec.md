# Spec Delta

## ADDED Requirements

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
