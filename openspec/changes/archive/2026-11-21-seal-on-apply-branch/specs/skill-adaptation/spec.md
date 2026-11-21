# skill-adaptation delta

## MODIFIED Requirements

### Requirement: Apply finishes with an apply review

Apply skill SHALL call `openspec_apply_next` once, commit each round, and run the apply review after the last task. It SHALL start, read the brief, resume later rounds, self-report when `reviewers` is 0, and stop while not ready. A plan change during apply SHALL be user-approved and recorded with `openspec_review` `waive` `scope: "plan-change"` before editing. It SHALL start a review with no locked policy and skip it only without git or when disabled.

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
- **THEN** a worktree-disabled project commits `openspec/changes/<name>/` and, when the plugin created or changed it, `openspec/.gitignore` before the first apply task
- **AND** a git worktree apply calls `openspec_apply_next` without committing, because the plugin seals on the apply branch

#### Scenario: The skill commits each round

- **WHEN** an apply round is about to start or resume
- **THEN** the skill commits the changed files first

#### Scenario: A plan change during apply is waived first

- **WHEN** the implementation needs a change to the planning artifacts after apply started
- **THEN** the skill explains the change, gets the user's written approval and records the waiver before editing

#### Scenario: A project without git skips the review

- **WHEN** the project has no git repository
- **THEN** the skill states apply review is unavailable and skips it
