# Spec Delta

## MODIFIED Requirements

### Requirement: Apply review is gated by its own policy

The apply review SHALL be enabled by the change policy and SHALL use its own round and wait limits. It SHALL be unavailable when the policy disables it or when the project has no git. When the project has no git repository, policy creation SHALL lock the apply review disabled even when the settings enable it.

#### Scenario: Policy disables apply review

- **WHEN** the change policy disables apply review
- **THEN** archive does not require an apply review

#### Scenario: Policy locks apply review settings

- **WHEN** a change is created with apply review enabled
- **THEN** later settings edits do not alter that change's apply review

#### Scenario: Project has no git at creation

- **WHEN** a change is created in a project without a git repository and the settings enable apply review
- **THEN** the locked policy has `reviews.apply.enabled` false and `git.enabled` false
- **AND** the apply review remains unavailable for that change

#### Scenario: Legacy no-git policy stays enabled in the record

- **WHEN** a policy written before this change enables apply review in a project without git
- **THEN** the policy still records `reviews.apply.enabled` true
- **AND** the review is unavailable and archive does not require it
