# skill-adaptation Specification Delta

## ADDED Requirements

### Requirement: Apply finishes with an apply review

The shipped apply skill SHALL run the apply review after the last task and before reporting completion. It SHALL commit the implementation, start the review, read the brief, submit the self-review report when `reviewers` is 0, and stop while the review is not ready.

#### Scenario: Apply reaches the review gate

- **WHEN** every task is complete and the implementation is committed
- **THEN** the skill calls `openspec_review` with `action: "start"` and `review: "apply"` before reporting completion

#### Scenario: Apply review is not ready

- **WHEN** the apply review reports a blocker
- **THEN** the skill fixes the finding and starts another round instead of reporting completion

### Requirement: Archive requires the apply review

The shipped archive skill SHALL check the apply review before calling `openspec_archive`. It SHALL stop when the review is enabled and not ready, and SHALL state that a project without git has no apply review.

#### Scenario: Archive starts after a ready review

- **WHEN** the user asks to archive and the apply review is ready
- **THEN** the skill calls `openspec_archive`

#### Scenario: Archive sees a blocked review

- **WHEN** the apply review is not ready
- **THEN** the skill stops and reports the review blockers
