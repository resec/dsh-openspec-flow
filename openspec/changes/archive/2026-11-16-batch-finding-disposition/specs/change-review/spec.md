# Spec Delta

## ADDED Requirements

### Requirement: Finding dispositions accept an atomic batch

`openspec_review` with `action: "dispose"`, or `action: "waive"` without `scope: "plan-change"`, SHALL accept a `dispositions` array of entries that each name an `id` and the fields that apply. A `dispose` entry SHALL carry its own `status`. A call SHALL supply either `dispositions` or the single `id` form, not both. The batch SHALL validate every entry before writing and leave the record unchanged when any entry is invalid. The result SHALL carry one `dispositions` entry per finding.

#### Scenario: Several findings are disposed

- **WHEN** a call passes two valid entries in `dispositions`
- **THEN** both findings are disposed
- **AND** the result lists both ids and their statuses

#### Scenario: One entry is invalid

- **WHEN** one entry resolves and another entry is rejected
- **THEN** the call fails
- **AND** neither finding changes

#### Scenario: Duplicate id

- **WHEN** `dispositions` names the same finding twice
- **THEN** the call fails and the record is unchanged

#### Scenario: Both forms are supplied

- **WHEN** a call passes `id` and `dispositions`
- **THEN** the call fails and names the choice

#### Scenario: Single-form fields are refused with a batch

- **WHEN** a call passes `dispositions` with a top-level `status` or `note`
- **THEN** the call fails and names the batch form

#### Scenario: Single form still works

- **WHEN** a call passes `id`, `status` and `note` without `dispositions`
- **THEN** the single finding is disposed as before

#### Scenario: Batch waiver shares a default

- **WHEN** a `waive` call passes top-level `approvedBy` and `waiver` with two entries that omit them
- **THEN** both findings are waived with those values

### Requirement: Plan-change waiver stays separate from finding dispositions

`openspec_review` with `action: "waive"` and `scope: "plan-change"` SHALL keep its `files` contract and SHALL reject a `dispositions` argument. The finding batch SHALL NOT apply to that mode.

#### Scenario: Plan-change waiver rejects a batch

- **WHEN** a call passes `scope: "plan-change"` and `dispositions`
- **THEN** the call fails and names the plan-change form

#### Scenario: Plan-change waiver keeps files

- **WHEN** a user-approved plan change is recorded
- **THEN** the call takes `files` and no finding id

### Requirement: Deferred findings carry a note

A `deferred` disposition SHALL require a non-empty `note`; a follow-up issue reference SHALL be recorded inside that note. A disposition SHALL NOT accept an `issue` field, and the record SHALL NOT write one.

#### Scenario: Deferred without a note

- **WHEN** a caller defers a minor finding without a note
- **THEN** the disposition is rejected

#### Scenario: Issue field is refused

- **WHEN** a caller passes `issue` to a disposition
- **THEN** the parameter schema rejects the call

#### Scenario: Old record keeps its bytes

- **WHEN** a record written before this change carries a finding issue
- **THEN** readiness and the projections ignore it
- **AND** the record is not migrated
