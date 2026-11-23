# Spec Delta

## MODIFIED Requirements

### Requirement: Draft review is exposed as one tool

The plugin SHALL expose `openspec_review` for the draft review. Its `action` parameter SHALL select `start`, `resume`, `wait`, `status`, `self-report`, `report`, `dispose`, `waive`, `retry`, `replace`, `waive-reviewer`, `extend` or `abandon`. The tool SHALL return the review id, the current round, the artifact hash, the status and the next action.

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

#### Scenario: Every accepted action is described

- **WHEN** an agent reads the `openspec_review` `action` parameter
- **THEN** its description names every value the parameter accepts, including `wait`, `retry`, `replace` and `waive-reviewer`

## ADDED Requirements

### Requirement: Apply review accepts the reviewer actions

`openspec_review` SHALL accept `review: "apply"` with `action: "wait"`, `"retry"`, `"replace"` or `"waive-reviewer"`. `wait` reads the reviewer state once and arms the round deadline; `retry` messages the same reviewer to submit again; `replace` activates a substitute reviewer for a reason; `waive-reviewer` records a user-approved coverage gap in place of a report.

#### Scenario: Apply review waits for the reviewer

- **WHEN** an agent calls `openspec_review` with `action: "wait"` and `review: "apply"` while the reviewer round is open
- **THEN** the result reports the wait state and the next action

#### Scenario: Apply review replaces the reviewer

- **WHEN** an agent calls `openspec_review` with `action: "replace"`, `review: "apply"` and a reason
- **THEN** a substitute reviewer is activated and the next action is `wait`

#### Scenario: Reviewer coverage is waived with user approval

- **WHEN** `waive-reviewer` runs with `review: "apply"`, a waiver and `approvedBy: "user"` before the reviewer reports
- **THEN** the review records the coverage gap
- **AND** the same call without `approvedBy: "user"` is refused
