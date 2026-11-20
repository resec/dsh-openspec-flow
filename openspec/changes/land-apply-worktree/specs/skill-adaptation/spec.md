# Spec Delta

## MODIFIED Requirements

### Requirement: Apply finishes with an apply review

Apply skill SHALL seal the change directory and the plugin's ignore file before the first task, commit each round, and run the apply review after the last task. It SHALL start, read the brief, resume later rounds, self-report when `reviewers` is 0, and stop while not ready. A plan change during apply SHALL be user-approved and recorded with `openspec_review` `waive` `scope: "plan-change"` before editing. It SHALL start a review with no locked policy and skip it only without git or when disabled.

#### Scenario: Apply reaches the review gate

- **WHEN** every task is complete, the implementation is committed and apply review is available
- **THEN** the skill calls `openspec_review` with `action: "start"` and `review: "apply"` before reporting completion

#### Scenario: An apply round resumes

- **WHEN** the apply review already has a record and the skill must run another round
- **THEN** it calls `openspec_review` with `action: "resume"` and no intent

#### Scenario: Apply review is not ready

- **WHEN** the apply review reports a blocker
- **THEN** the skill fixes the finding and resumes another round instead of reporting completion

#### Scenario: Apply review is unavailable

- **WHEN** the project has no git repository or a locked policy disables apply review
- **THEN** the skill reports that the review cannot run and continues without one

#### Scenario: Apply has no locked policy

- **WHEN** a git project's change has no review policy yet
- **THEN** the skill starts the apply review so the first start locks a policy

#### Scenario: The first start locks a disabled policy

- **WHEN** a git project's change has no policy and the settings disable apply review
- **THEN** the first start locks a disabled policy and the skill reports that the review cannot run and continues

#### Scenario: The skill seals the draft before apply

- **WHEN** the draft review is ready in a git project
- **THEN** the skill commits `openspec/changes/<name>/` and, when the plugin created or changed it, `openspec/.gitignore`, before the first apply task

#### Scenario: The skill commits each round

- **WHEN** an apply round is about to start or resume
- **THEN** the skill commits the changed files first

#### Scenario: A plan change during apply is waived first

- **WHEN** the implementation needs a change to the planning artifacts after apply started
- **THEN** the skill explains the change, gets the user's written approval and records the waiver before editing

#### Scenario: A project without git skips the review

- **WHEN** the project has no git repository
- **THEN** the skill states apply review is unavailable and skips it


### Requirement: Archive requires the apply review

The shipped archive skill SHALL check a plugin-created active apply worktree and direct it to `openspec_apply_worktree action=land`, not `openspec_archive`; a landed worktree change is already archived. Otherwise it SHALL check the apply review status before `openspec_archive`: stop only when policy, enabled and available are true and the review is not ready; continue with a stated reason when unavailable, disabled or no policy.

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

#### Scenario: An active worktree change is sent to land

- **WHEN** the change state is a plugin-created active apply worktree
- **THEN** the skill directs the user to `openspec_apply_worktree action=land` and does not call `openspec_archive`

#### Scenario: A landed worktree change is already archived

- **WHEN** the change state is a landed plugin-created worktree
- **THEN** the skill reports it is already archived

#### Scenario: A PR worktree follows the archive path

- **WHEN** the change state records a user-created PR worktree or no worktree
- **THEN** the existing apply-review gate and `openspec_archive` path apply

## ADDED Requirements

### Requirement: A worktree apply finishes with land

After the apply review, a plugin-created worktree apply SHALL finish with `openspec_apply_worktree action=land`; the skill SHALL NOT report completion or archive before land.

#### Scenario: A worktree apply finishes with land

- **WHEN** a plugin-created worktree apply has a ready review
- **THEN** the skill calls `openspec_apply_worktree action=land` as the terminal step
