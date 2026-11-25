# Spec Delta: contributor-workflow

## ADDED Requirements

### Requirement: Main pushes queue instead of cancelling the run in progress

The CI workflow SHALL cancel an in-progress run only for `pull_request` events: `cancel-in-progress` SHALL be `${{ github.event_name == 'pull_request' }}`, and the workflow-level concurrency group SHALL stay `ci-${{ github.ref }}`. A push to `main` SHALL wait as a pending run, while a new pull-request push SHALL still cancel the run for the previous head. The workflow test SHALL assert the workflow-level placement, the group and the conditional expression.

#### Scenario: A second push to main waits for the run in progress

- **WHEN** a second push to `main` arrives while the run for the first push is in progress
- **THEN** the second run starts after the first completes and neither run ends as cancelled

#### Scenario: A third push replaces the single pending run

- **WHEN** a third push to `main` arrives while one run is in progress and another is pending
- **THEN** the pending run is cancelled and the third push's run becomes the pending run

#### Scenario: A new pull-request push cancels the previous run

- **WHEN** a pull request receives a new push
- **THEN** the run for the previous head is cancelled and the new run starts
