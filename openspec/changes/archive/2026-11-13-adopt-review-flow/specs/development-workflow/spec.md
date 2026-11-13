# development-workflow Specification Delta

## ADDED Requirements

### Requirement: Repository changes pass the review gates

The repository SHALL run draft review after the planning artifacts are complete and before implementation, and apply review after the implementation is committed and before archive. It SHALL not archive a change whose apply review is not ready.

#### Scenario: A change starts implementation

- **WHEN** a contributor starts apply
- **THEN** the draft review is ready or the apply tool refuses

#### Scenario: A change is archived

- **WHEN** a contributor archives a change
- **THEN** the apply review is ready, or apply review is disabled or unavailable

#### Scenario: A review is not ready

- **WHEN** the draft or apply review reports a blocker
- **THEN** the change is not implemented or archived until the blocker is fixed or waived
