# Spec Delta

## MODIFIED Requirements

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review before it reads or advances the apply state. When the change has an enabled draft review policy that is not ready, the tool SHALL fail without changing the apply state and SHALL name `openspec_review` as the next step. On the first apply after a ready draft review in a git project it SHALL require the sealed draft commit and record it as the apply base; once apply started it SHALL NOT refuse on a draft artifact hash mismatch.

#### Scenario: Review is not ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is not ready
- **THEN** the call fails, the apply state is unchanged and the error names `openspec_review`

#### Scenario: Review is ready

- **WHEN** `openspec_apply_next` runs for a change whose draft review is ready
- **THEN** the call proceeds and returns the apply projection

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` proceeds without a review check

#### Scenario: Change has no policy

- **WHEN** a legacy change has no review policy
- **THEN** `openspec_apply_next` proceeds without a review check until the first review start writes the policy

#### Scenario: Ready review passes apply

- **WHEN** the change has a ready draft review and a sealed draft commit
- **THEN** `openspec_apply_next` proceeds and records the seal commit as the apply base

#### Scenario: Dirty tree is refused before the seal

- **WHEN** the change directory or another file has uncommitted changes before the first apply
- **THEN** the tool fails without changing the apply state and asks for a commit

#### Scenario: Mixed seal commit is refused

- **WHEN** `HEAD` changes files outside the change directory and `openspec/.gitignore` before the first apply
- **THEN** the tool fails and asks for a commit containing only the change directory and its ignore file

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** apply already started and the draft artifact hash no longer matches
- **THEN** the tool does not refuse the call on that mismatch

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

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start` or `resume` SHALL carry the review kind. It SHALL name `openspec_review` with `action: "start"` when the review has no record, and with `action: "resume"` when a record exists and either the current object differs from the recorded one or a finding is fixed but not verified. Once apply started, a draft next action SHALL NOT name `resume review=draft`; it SHALL name the apply review status instead.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose draft review has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`

#### Scenario: Draft status after apply started names the apply review

- **WHEN** `status` for a draft review runs after apply started and the artifacts changed
- **THEN** the next action names the apply review
- **AND** it does not name a draft resume
