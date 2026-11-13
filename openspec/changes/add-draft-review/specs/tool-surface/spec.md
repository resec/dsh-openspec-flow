# tool-surface Specification Delta

## ADDED Requirements

### Requirement: Draft review is exposed as one tool

The plugin SHALL expose `openspec_review` for the draft review. Its `action` parameter SHALL select `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` or `abandon`. The tool SHALL return the review id, the current round, the artifact hash, the status and the next action. It SHALL NOT expose reviewer-subagent actions until the independent reviewer is added.

#### Scenario: Draft review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** the result names the review id, round, artifact hash and a brief
- **AND** the brief lists the draft review axes and the artifact paths

#### Scenario: Review status is read

- **WHEN** an agent calls `openspec_review` with `action: "status"`
- **THEN** the result reports the state, whether the review is ready, the blockers and the next action

#### Scenario: Self-review report is submitted

- **WHEN** an agent calls `self-report` with a valid report for a `reviewers: 0` review
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Unknown action is refused

- **WHEN** `openspec_review` receives an action outside the supported set
- **THEN** the parameter schema rejects the call before execution

### Requirement: Draft review tool is absent when disabled

The plugin SHALL register `openspec_review` only while the draft review is enabled. When the draft review is disabled, an agent's tool catalog SHALL contain no `openspec_review` entry.

#### Scenario: Draft review is disabled

- **WHEN** the plugin loads with `reviews.draft.enabled` false
- **THEN** the tool catalog contains no `openspec_review`

#### Scenario: Draft review is enabled

- **WHEN** the plugin loads with `reviews.draft.enabled` true
- **THEN** the tool catalog contains `openspec_review`

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the draft review before it reads or advances the apply state. When the change has an enabled draft review policy that is not ready, the tool SHALL fail without changing the apply state and SHALL name `openspec_review` as the next step. When the review is ready in a git project, the tool SHALL record the current `HEAD` as the apply base commit.

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
