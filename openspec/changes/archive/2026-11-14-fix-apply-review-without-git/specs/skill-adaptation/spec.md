# Spec Delta

## MODIFIED Requirements

### Requirement: Apply finishes with an apply review

The shipped apply skill SHALL run the apply review after the last task and before reporting completion. It SHALL commit the implementation, start the review, read the brief, submit the self-review report when `reviewers` is 0, and stop while the review is not ready. It SHALL start the review when no policy is locked in a git project so the first start locks one. It SHALL skip the review only when the project has no git repository or when a locked policy disables it, stating which.

#### Scenario: Apply reaches the review gate

- **WHEN** every task is complete, the implementation is committed and apply review is available
- **THEN** the skill calls `openspec_review` with `action: "start"` and `review: "apply"` before reporting completion

#### Scenario: Apply review is not ready

- **WHEN** the apply review reports a blocker
- **THEN** the skill fixes the finding and starts another round instead of reporting completion

#### Scenario: Apply review is unavailable

- **WHEN** the project has no git repository or a locked policy disables apply review
- **THEN** the skill reports that the review cannot run and continues without one

#### Scenario: Apply has no locked policy

- **WHEN** a git project's change has no review policy yet
- **THEN** the skill starts the apply review so the first start locks a policy

#### Scenario: The first start locks a disabled policy

- **WHEN** a git project's change has no policy and the settings disable apply review
- **THEN** the first start locks a disabled policy and the skill reports that the review cannot run and continues

### Requirement: Archive requires the apply review

The shipped archive skill SHALL check the apply review status before calling `openspec_archive`. It SHALL stop only when `policy` is true, `enabled` is true, `available` is true and the review is not ready. When `available` is false, `policy` is false, or `enabled` is false, it SHALL state why and continue without waiting.

#### Scenario: Archive starts after a ready review

- **WHEN** the user asks to archive, a policy exists, and the apply review is enabled, available and ready
- **THEN** the skill calls `openspec_archive`

#### Scenario: Archive sees a blocked review

- **WHEN** the apply review is enabled and available but not ready
- **THEN** the skill stops and reports the review blockers

#### Scenario: Archive sees an unavailable or disabled review

- **WHEN** the apply review status reports `available: false` or `enabled: false` under an existing policy
- **THEN** the skill states the reason and calls `openspec_archive` without waiting

#### Scenario: Archive sees no policy

- **WHEN** the apply review status reports `policy: false`
- **THEN** the skill states that no review policy is locked and calls `openspec_archive` without waiting
