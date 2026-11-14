# Spec Delta

## MODIFIED Requirements

### Requirement: Draft review is exposed as one tool

The plugin SHALL expose `openspec_review` for the draft review. Its `action` parameter SHALL select `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` or `abandon`. The tool SHALL return the review id, the current round, the artifact hash, the status and the next action. It SHALL NOT expose reviewer-subagent actions until the independent reviewer is added.

#### Scenario: Draft review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** the result names the review id, round, artifact hash and a brief
- **AND** the brief lists the draft review axes and the artifact paths

#### Scenario: Draft review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "draft"` for a recorded review
- **THEN** the result names the current round, artifact hash and the round brief

#### Scenario: Review status is read

- **WHEN** an agent calls `openspec_review` with `action: "status"`
- **THEN** the result reports the state, whether the review is ready, the blockers and the next action

#### Scenario: Self-review report is submitted

- **WHEN** an agent calls `self-report` with a valid report for a `reviewers: 0` review
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Unknown action is refused

- **WHEN** `openspec_review` receives an action outside the supported set
- **THEN** the parameter schema rejects the call before execution

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept `review: "apply"` for `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the commit, tree, base tree and readiness. The tool SHALL refuse an apply `start` outside a git repository; `status` is governed by the status requirement below.

#### Scenario: Apply review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "apply"` on a clean commit
- **THEN** the result names the review id, round, commit, tree and base tree

#### Scenario: Apply review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "apply"` for a recorded review
- **THEN** the result names the round, commit, tree and base tree

#### Scenario: Apply review is unavailable

- **WHEN** an agent requests an apply review `start` without git
- **THEN** the call fails with an actionable error

#### Scenario: Apply report is submitted

- **WHEN** an agent submits a valid apply report
- **THEN** the report is stored and the status reflects its verdict

## ADDED Requirements

### Requirement: Review actions name the other round entry

`openspec_review` SHALL keep `start` and `resume` disjoint. A `start` whose review record exists SHALL fail and name `resume`. A `resume` whose review record is absent SHALL fail and name `start`. Both errors SHALL carry the action to call next.

#### Scenario: Start names resume

- **WHEN** `start` is called for a draft or apply review that already has a record
- **THEN** the error names `openspec_review` with `action: "resume"`

#### Scenario: Resume names start

- **WHEN** `resume` is called for a draft or apply review that has no record
- **THEN** the error names `openspec_review` with `action: "start"`

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start` or `resume` SHALL carry the review kind. It SHALL name `openspec_review` with `action: "start"` when the review has no record, and with `action: "resume"` when a record exists and either the current object differs from the recorded one or a finding is fixed but not verified.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose draft review has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`
