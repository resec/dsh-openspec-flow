# Spec Delta: fix-superseded-check-runs

## ADDED Requirements

### Requirement: Green CI rollup

`checksGreen` SHALL treat a rollup as green only when at least one check exists and every check's newest entry succeeded. A pending, failed or unknown newest entry, and an empty rollup, SHALL NOT be green.

#### Scenario: Superseded failure

- **WHEN** a check has an older failed entry and a newer successful entry
- **THEN** the rollup is green

#### Scenario: Newest failure

- **WHEN** the newest entry of any check failed
- **THEN** the rollup is not green

#### Scenario: Newest pending

- **WHEN** the newest entry of any check is pending
- **THEN** the rollup is not green

#### Scenario: Empty rollup

- **WHEN** the rollup has no entries
- **THEN** the rollup is not green

### Requirement: Superseded check entry

Checks SHALL be grouped by workflow name and check name, or by status context name. A usable start time is an entry's `startedAt` or, without one, its `createdAt`; an absent or `0001-01-01T00:00:00Z` value SHALL NOT be usable. A group whose entries all carry a usable start time is green only when every entry at the latest such time succeeded; earlier entries are superseded and ignored. A group containing an entry without a usable start time is green only when every entry in it succeeded.

#### Scenario: Superseded entry

- **WHEN** a check has an earlier failed entry and a newer successful entry
- **THEN** the earlier entry is ignored and the check is green

#### Scenario: Same start time

- **WHEN** several entries of one check share the latest usable start time and one of them failed
- **THEN** the check is not green

#### Scenario: Queued entry with zero start time

- **WHEN** a check has a completed successful entry and a newer queued entry whose `startedAt` is `0001-01-01T00:00:00Z`
- **THEN** the group requires every entry to succeed and the check is not green

#### Scenario: Same check name in two workflows

- **WHEN** two workflows report a check with the same name and one workflow's newest entry failed
- **THEN** the rollup is not green

## MODIFIED Requirements

### Requirement: Open pull-request polling

`scripts/pr-review-watch.mjs poll` SHALL report a PR as a candidate only when it is not a draft, has a green CI rollup, changes exactly one active change, and its head SHA has no published review. A prepared or failed head SHALL be re-emitted for retry. A PR with pending checks or no checks SHALL NOT be a candidate.

#### Scenario: Mixed pull-request list

- **WHEN** the open list contains a draft PR, a PR with a failed check, a PR with pending checks, a PR with no checks, a PR with two active changes, an already-commented head and one eligible PR
- **THEN** only the eligible PR is reported as a candidate, with its number, head, baseRefOid, baseRefName, change, worktree, status and resume

#### Scenario: No eligible pull request

- **WHEN** every open PR is filtered out
- **THEN** the poll reports an empty candidate list and exits successfully
