## MODIFIED Requirements

### Requirement: openspec_review accepts an explicit apply review base

`openspec_review` SHALL declare an optional `base` string parameter with a non-empty description. The value MAY be a commit, branch or tag reference. Apply `start` and `resume` SHALL pass it to the base resolution; other actions SHALL ignore it. A blank or whitespace-only value SHALL be ignored, except when the caller explicitly passes `baseline: "none"`, where a missing or blank value SHALL fail. The parameter SHALL be part of the registered schema and SHALL NOT be required.

#### Scenario: The schema declares base

- **WHEN** an agent reads the registered `openspec_review` parameter schema
- **THEN** `base` is an optional string with a non-empty description
- **AND** `base` is not listed in `required`

#### Scenario: An explicit base is accepted

- **WHEN** a caller passes `base` to an apply review start or resume
- **THEN** the call is accepted and the base is the passed reference

#### Scenario: A blank base is ignored

- **WHEN** a caller passes a whitespace-only `base` with a baseline other than `none`
- **THEN** the base falls back to the recorded apply base or `git merge-base HEAD origin/main`

#### Scenario: A blank base with an explicit no-draft baseline fails

- **WHEN** a caller explicitly passes `baseline: "none"` with a whitespace-only or missing `base`
- **THEN** the call fails and names `base` as required

#### Scenario: A blank base on a draft-disabled policy falls back

- **WHEN** the draft policy is disabled, the caller omits `baseline`, and `base` is blank or missing
- **THEN** the base falls back to `git merge-base HEAD origin/main` as before

#### Scenario: Other actions ignore base

- **WHEN** a caller passes `base` to an action other than apply start or resume
- **THEN** the action behaves as if `base` were absent

## ADDED Requirements

### Requirement: openspec_review accepts an explicit no-draft apply baseline

`openspec_review` SHALL declare an optional `baseline` string parameter for apply `start` and `resume`, with values `draft` and `none`. An omitted value SHALL mean `draft` on start when the draft policy is enabled, `none` when it is disabled, and the recorded baseline on resume. The record SHALL store it; `status` and `report` SHALL return it. An explicit resume value different from the record SHALL be refused. Other actions SHALL ignore it.

#### Scenario: The schema declares baseline

- **WHEN** an agent reads the registered `openspec_review` parameter schema
- **THEN** `baseline` is an optional string with the values `draft` and `none`
- **AND** `baseline` is not listed in `required`

#### Scenario: A no-draft apply review starts

- **WHEN** a caller passes `action: "start"`, `review: "apply"`, `baseline: "none"` and a non-empty `base` on a clean committed tree, and the change has no draft review record
- **THEN** the apply review opens a round and records `baseline: "none"`

#### Scenario: A no-draft apply review requires base

- **WHEN** a caller explicitly passes `baseline: "none"` and no non-empty `base`
- **THEN** the call fails and names `base` as required

#### Scenario: An existing draft record refuses the no-draft baseline

- **WHEN** a change has a draft review record and the caller explicitly starts an apply review with `baseline: "none"`
- **THEN** the call fails and names the draft review

#### Scenario: A draft-disabled policy records the none baseline

- **WHEN** the draft policy is disabled and a caller starts an apply review with an omitted baseline
- **THEN** the review opens and records `baseline: "none"`

#### Scenario: An explicit draft baseline is refused when the draft policy is disabled

- **WHEN** the draft policy is disabled and a caller explicitly passes `baseline: "draft"`
- **THEN** the call fails and names `baseline: "none"`

#### Scenario: A resume keeps the recorded baseline

- **WHEN** a caller resumes an apply review with an explicit baseline different from the recorded baseline
- **THEN** the call fails and names the recorded baseline

#### Scenario: An omitted resume baseline uses the record

- **WHEN** a caller resumes an apply review recorded with `baseline: "none"` and omits `baseline`
- **THEN** the call proceeds with the recorded `none` baseline

#### Scenario: The default with an enabled draft policy requires a draft

- **WHEN** the draft policy is enabled and a caller starts an apply review without `baseline` for a change with no draft review record
- **THEN** the call fails as before and asks for a completed draft review

#### Scenario: Status reports the baseline

- **WHEN** an apply review record stores `baseline: "none"`
- **THEN** `openspec_review` with `action: "status"` and `review: "apply"` reports that baseline

#### Scenario: Report returns the baseline

- **WHEN** an apply review record stores `baseline: "none"` and a caller reads its report
- **THEN** the result reports that baseline

#### Scenario: A legacy record reports the draft baseline

- **WHEN** an apply review record has no `baseline` field
- **THEN** `status` and `report` report `draft` for it

#### Scenario: Other actions ignore baseline

- **WHEN** a caller passes `baseline` to an action other than apply `start` or `resume`
- **THEN** the action behaves as if `baseline` were absent
