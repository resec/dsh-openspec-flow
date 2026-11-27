# Spec Delta

## MODIFIED Requirements

### Requirement: Draft review gates requirement description growth

The draft review SHALL check every delta requirement description against the 500-character limit at start and resume, and record the result. Lengths count UTF-16 code units. It SHALL block when an ADDED description exceeds the limit, or a MODIFIED description exceeds the limit and is longer than its main-spec baseline. The same check SHALL run at the first apply entry before apply starts and before an apply review round opens. An unchanged or shortened legacy description SHALL NOT block.

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
