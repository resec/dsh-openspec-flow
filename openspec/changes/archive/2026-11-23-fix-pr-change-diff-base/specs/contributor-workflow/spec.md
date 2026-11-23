# Spec Delta

## ADDED Requirements

### Requirement: The change check compares the base with the pull-request head

Pull-request CI SHALL run the change check against the pull request head commit, comparing the commits reachable from the head and not from the recorded base commit, instead of against the checked-out merge commit. Commits that land on the base branch after the pull request opens SHALL NOT count as pull-request changes. A pull request that itself changes a restricted path SHALL still fail.

#### Scenario: The base branch advanced after the pull request opened

- **WHEN** commits land on the base branch after the pull request opened
- **THEN** the change check reads only the pull request's own paths
- **AND** it does not report the landed paths as restricted

#### Scenario: The pull request changes a restricted path

- **WHEN** the pull request itself changes a restricted path
- **THEN** the check fails and names that path

#### Scenario: A reopened pull request

- **WHEN** a pull request is reopened without new commits
- **THEN** the check compares the same base and head commits
- **AND** the advanced base branch does not fail it
