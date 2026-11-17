# change-review spec delta

## ADDED Requirements

### Requirement: Draft review gates requirement description growth

The draft review SHALL check every delta requirement description against the 500-character limit at start and resume, and record the result. It SHALL block when an ADDED description exceeds the limit, or a MODIFIED description exceeds the limit and is longer than its main-spec baseline. The same check SHALL run at the first apply entry before apply starts and before an apply review round opens. An unchanged or shortened legacy description SHALL NOT block.

#### Scenario: An ADDED description exceeds the limit

- **WHEN** a draft review starts for a change whose ADDED description exceeds 500 characters
- **THEN** the round opens
- **AND** the brief lists the requirement, its length and the official handling
- **AND** the draft review is not ready

#### Scenario: A MODIFIED description grows past the limit

- **WHEN** a MODIFIED description exceeds 500 characters and is longer than the main-spec requirement it replaces
- **THEN** the brief lists the current and baseline lengths
- **AND** the draft review is not ready

#### Scenario: A legacy overlong description is unchanged or shortened

- **WHEN** a MODIFIED description exceeds 500 characters and is not longer than its baseline
- **THEN** the gate records no blocking issue
- **AND** the review may be ready after a passing report

#### Scenario: A later round clears the growth

- **WHEN** the author changes the artifacts and resumes the review
- **THEN** the gate rechecks the current artifacts
- **AND** a cleared result no longer blocks readiness

#### Scenario: A rename supplies the baseline

- **WHEN** a MODIFIED requirement is renamed in the same change
- **THEN** the gate follows the rename to the main-spec baseline before comparing lengths

#### Scenario: The first apply entry rechecks the current baseline

- **WHEN** the first `openspec_apply_next` runs after the draft review, before apply starts
- **THEN** it rechecks the delta against the current main specs before the readiness gate
- **AND** it refuses when a blocking result is present

#### Scenario: Apply review rechecks the committed plan

- **WHEN** an apply review starts or resumes after a plan edit
- **THEN** the length gate runs before the round opens
- **AND** a blocking result refuses the round

## MODIFIED Requirements

### Requirement: Draft readiness gates apply

Before apply starts, the draft review SHALL be ready only when its latest report is valid, its verdict is `pass`, every critical or major finding is verified or waived, every finding has a disposition, no blocking requirement-length result is recorded, and the artifact hash matches. `openspec_apply_next` SHALL refuse to start apply while an enabled draft review is not ready; after apply starts, apply review rechecks the length result.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no open blocker, no blocking length result and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: Blocking length result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking length result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Open blocker blocks apply

- **WHEN** the latest report has an open major finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` as the next step

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` does not require a draft review

#### Scenario: Legacy change has no policy

- **WHEN** a change predates the review policy and no policy file exists
- **THEN** `openspec_apply_next` does not enforce the gate before the first review start

#### Scenario: Apply started ignores the artifact drift

- **WHEN** apply started and the change artifacts no longer equal the draft record hash
- **THEN** the draft review readiness no longer reports the hash mismatch
- **AND** the next action points at the apply review

#### Scenario: A started apply defers the length check

- **WHEN** apply started and the current artifacts carry a blocking length result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call
