# Spec Delta

## MODIFIED Requirements

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept `review: "apply"` for `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the commit, tree, base tree and readiness. The tool SHALL refuse an apply `start` outside a git repository; `status` is governed by the status requirement below. With `action: "waive"` and `scope: "plan-change"`, the tool SHALL accept `waiver` and `files` and record the plan-change waiver in the review directory.

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

#### Scenario: Plan-change waiver is recorded

- **WHEN** apply started and `waive` is called with `scope: "plan-change"`, a non-empty `waiver`, `approvedBy: "user"` and `files`
- **THEN** the review directory carries the waiver and the result reports it

#### Scenario: Plan-change waiver before apply started is refused

- **WHEN** `waive` with `scope: "plan-change"` runs before apply started
- **THEN** the call fails and names the draft review

#### Scenario: Waiver result names uncovered drift

- **WHEN** a waiver is recorded while the apply review record exists and a drift file stays outside its normalized file set
- **THEN** the result names that file
- **AND** the result does not report the waiver as covering it
