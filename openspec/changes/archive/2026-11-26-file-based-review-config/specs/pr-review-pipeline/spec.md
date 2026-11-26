# Spec Delta

## MODIFIED Requirements

### Requirement: Apply review precondition

The review session SHALL call `openspec_review action=status review=apply` with the PR worktree before starting. When status reports `policy: false`, the session SHALL start the review with the baseline review configuration as `configPath` and then require the returned mode to be `reviewer`. When a policy exists, the session SHALL review only when apply review is available, enabled and in independent reviewer mode.

#### Scenario: No locked policy

- **WHEN** status reports `policy: false` and the first start with the baseline configuration returns reviewer mode
- **THEN** the session proceeds with the apply review

#### Scenario: Self mode after start

- **WHEN** the first start returns self-review mode
- **THEN** the session publishes no review, submits no self-report, and reports the baseline configuration and its recovery

#### Scenario: Disabled or unavailable policy

- **WHEN** an existing policy is disabled or apply review is unavailable
- **THEN** the session publishes no review and reports the status

#### Scenario: The baseline configuration is refused

- **WHEN** the baseline configuration path is missing or invalid at the first start
- **THEN** the start fails and the session publishes no review

### Requirement: Independent reviewer prerequisite

Before enabling the scheduled watch, the maintainer SHALL confirm that the baseline `main` `openspec/reviews.json` names a tree profile for the apply entry with `reviewers: 1`. When the first start returns self-review mode, the documented recovery SHALL be: fix the baseline file on `main`, remove the change's locked `policy.json` and `apply-review.json` with user approval, remove the apply state that names the PR checkout, and rerun; a fresh change name SHALL be the alternative.

#### Scenario: Profile prerequisite

- **WHEN** the maintainer enables the scheduled watch
- **THEN** the baseline apply entry names a tree profile with one reviewer

#### Scenario: Self mode recovery

- **WHEN** the first start returns self-review mode and locked a policy
- **THEN** the session reports the exact files to remove, the baseline configuration to fix, and publishes no review

### Requirement: Apply review on the pull-request branch

The session SHALL call `openspec_review` with `review: "apply"`, `baseline: "none"`, the merge base as `base`, the PR worktree and the baseline review configuration as `configPath`. The review object SHALL be the committed pull-request head tree; for a prepared landing the head contains the pre-merge main and is reviewed with it as `base`. A passed record matching the landing tree SHALL replace the prepared-landing review. No PR code SHALL be executed.

#### Scenario: First review round

- **WHEN** a candidate PR has no apply review record and the preconditions pass
- **THEN** the session starts the apply review with the explicit merge-base base, the baseline configuration and an independent reviewer

#### Scenario: Landing review tree

- **WHEN** a pull request is prepared for landing
- **THEN** the session reviews the head tree whose commit contains the pre-merge main

#### Scenario: Review evidence

- **WHEN** the reviewer inspects the PR worktree
- **THEN** it reads the committed head tree and CI evidence only, and it does not run the PR's install, test or build commands

#### Scenario: Passed record replaces the landing review

- **WHEN** a pull request is prepared for landing, the recorded apply review is passed and its `treeSha` equals the landing tree
- **THEN** the session advances `reviewed` without starting the prepared-landing review

## ADDED Requirements

### Requirement: The review session uses the baseline main configuration

The watch SHALL copy the baseline `main` `openspec/reviews.json` to a path outside the PR checkout and pass that path as `configPath` when the session locks the PR change's policy. The PR head's own `openspec/reviews.json` SHALL NOT supply the review parameters. A missing baseline file SHALL refuse the review.

#### Scenario: The baseline file is used

- **WHEN** the session locks the PR change's policy
- **THEN** it passes the copied baseline configuration and the policy records that source

#### Scenario: The PR head changes its own file

- **WHEN** the PR head carries a different `openspec/reviews.json` than the baseline
- **THEN** the review parameters come from the baseline configuration

#### Scenario: The baseline file is missing

- **WHEN** `main` has no `openspec/reviews.json`
- **THEN** the review is refused and the refusal names the missing baseline file
