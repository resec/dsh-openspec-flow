# Spec Delta: change-review

## ADDED Requirements

### Requirement: Dispositions name their review kind

`openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require `review: "draft"` or `review: "apply"`. A call that omits `review` SHALL fail before any review record is read or written, and the error SHALL name the parameter and both accepted values. The plugin SHALL NOT treat an absent `review` as `draft` for these two actions.

#### Scenario: A disposition without a kind is refused

- **WHEN** `action: "dispose"` is called without `review`
- **THEN** the call fails before any record is read
- **AND** the error names `review` with `draft` and `apply`
- **AND** neither review record changes

#### Scenario: A draft batch names its record

- **WHEN** `action: "dispose"` is called with `review: "draft"` and a valid batch
- **THEN** the draft findings are disposed
- **AND** the apply record is unchanged

#### Scenario: An apply batch names its record

- **WHEN** `action: "dispose"` is called with `review: "apply"` and a valid batch
- **THEN** the apply findings are disposed
- **AND** the draft record is unchanged

#### Scenario: A finding waiver requires the kind

- **WHEN** `action: "waive"` without `scope: "plan-change"` is called without `review`
- **THEN** the call fails and names the parameter
- **AND** the finding keeps its status

### Requirement: A started apply freezes draft dispositions

Once apply started, a draft `dispose` or a draft finding `waive` SHALL fail and leave the draft record unchanged, and the error SHALL name the apply review status. Apply dispositions and the plan-change `waive` SHALL keep their behavior; the existing draft freeze on `start` and `resume` stays as it is.

#### Scenario: Draft dispose after apply started is refused

- **WHEN** apply started and `action: "dispose"` with `review: "draft"` is called
- **THEN** the call fails and names the apply review status
- **AND** every draft finding keeps its status and verification round

#### Scenario: Draft finding waiver after apply started is refused

- **WHEN** apply started and a draft finding `action: "waive"` is called
- **THEN** the call fails
- **AND** the draft finding is not waived

#### Scenario: Apply dispose still writes

- **WHEN** apply started and `action: "dispose"` with `review: "apply"` is called with a valid batch
- **THEN** the apply findings are disposed

#### Scenario: The plan-change waiver still records

- **WHEN** apply started and `action: "waive"` with `scope: "plan-change"` and `files` is called with user approval
- **THEN** the waiver is recorded in the review directory

## MODIFIED Requirements

### Requirement: A refused verification reports the finding's current state

When a report carries a verification with status `verified-fixed` for a finding whose recorded status is `open`, `deferred` or `rejected`, the plugin SHALL refuse the report and report that status plus the changer's `openspec_review action=dispose review=<kind>` step with `status=fixed` and a note, using the review record's own kind. When the finding is already `verified` or `waived`, the refusal SHALL say the finding is closed and SHALL NOT direct another disposal.

#### Scenario: An open finding cannot be verified fixed

- **WHEN** a report verifies `R1-01` as `verified-fixed` and the recorded finding is still `open`
- **THEN** the report is refused
- **AND** the error names `open`, `action=dispose`, the review kind and `status=fixed`

#### Scenario: A deferred finding cannot be verified fixed

- **WHEN** a report verifies a finding as `verified-fixed` and the recorded finding is `deferred`
- **THEN** the report is refused and the error names `deferred`

#### Scenario: A verified finding is already closed

- **WHEN** a report verifies a `verified` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed and does not direct a disposal

#### Scenario: A waived finding is already closed

- **WHEN** a report verifies a `waived` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed
