# pr-review-pipeline delta

## ADDED Requirements

### Requirement: Complete pull-request discovery

The watch poll and the landing candidate listing SHALL request the GitHub CLI open-list ceiling of 1000 pull requests. Every returned row SHALL be evaluated: the poll SHALL report each eligible row as a candidate, and the landing listing SHALL report a `mergeable`-labeled row as a candidate or as a refusal, never omitted silently. Rows beyond that ceiling are outside the read and the documented bound. Reading SHALL write nothing.

#### Scenario: An old labeled pull request is evaluated

- **WHEN** an open `mergeable`-labeled pull request is older than the newest 50 open pull requests but within the 1000-row read
- **THEN** `candidates` evaluates it and reports it as a candidate or a refusal, never omits it because it is outside a small page

#### Scenario: The poll reads beyond one default page

- **WHEN** an eligible review candidate is beyond the old 100-row page but within the 1000-row read
- **THEN** the poll reports it as a candidate

#### Scenario: The ceiling row is evaluated

- **WHEN** the open list returns 1000 rows and the last row is a `mergeable`-labeled pull request
- **THEN** `candidates` evaluates that row

#### Scenario: Beyond the ceiling is a documented bound

- **WHEN** the open list contains more than 1000 pull requests
- **THEN** the read stops at the documented bound and `docs/pr-review.md` states that a pull request beyond it is not discovered

#### Scenario: Read-only discovery

- **WHEN** the poll or `candidates` runs
- **THEN** it writes no watch or landing state

### Requirement: Mergeable-first review order

The watch poll SHALL order review candidates that carry the `mergeable` label before candidates without it, and SHALL keep the existing relative order inside each group. The label SHALL NOT add an ineligible pull request to the candidate list.

#### Scenario: Labeled candidates come first

- **WHEN** the open list contains `mergeable`-labeled review candidates and unlabeled review candidates
- **THEN** the labeled candidates are reported first in their original relative order, followed by the others in theirs

#### Scenario: The label does not satisfy a review gate

- **WHEN** a `mergeable`-labeled pull request is a draft or fails the review gates
- **THEN** it is not reported as a review candidate

#### Scenario: Labeled candidates keep their order

- **WHEN** two `mergeable`-labeled candidates are eligible
- **THEN** their relative order is unchanged

### Requirement: Batch same-repository branch sync

`sync-batch` SHALL update eligible same-repository pull request branches in one run: open, non-draft, based on `main`, carrying `mergeable`, behind the fetched `origin/main`, changing exactly one active change and with no open landing. It SHALL skip a fork branch, an up-to-date branch and a conflicting branch, continue after a per-pull-request refusal, record the same sync entry as `sync`, create no landing entry and consume no landing phase.

#### Scenario: The batch syncs every eligible branch up to its limit

- **WHEN** several `mergeable`-labeled same-repository branches are behind `main`, no landing is open, and at most 20 are eligible
- **THEN** one `sync-batch --apply` updates every one of them

#### Scenario: A fork branch is refused

- **WHEN** a labeled fork branch is behind `main`
- **THEN** the batch refuses it with an author-update reason and changes nothing

#### Scenario: One refusal does not stop the batch

- **WHEN** one pull request's update is refused
- **THEN** the batch continues with the remaining pull requests and reports each refusal

#### Scenario: The batch creates no landing

- **WHEN** the batch completes
- **THEN** no landing entry is created and no landing phase is consumed

### Requirement: Batch sync stop and bounds

A batch SHALL stop the run only when it changed at least one head. An empty, all-refused or lock-refused batch SHALL NOT stop the run: it SHALL continue to the landing or review step so reviews remain available. A batch SHALL evaluate every returned row, apply at most 20 updates per run and leave the remainder to the next run, and SHALL wait at most 10 seconds per updated head before reporting it and continuing.

#### Scenario: A changed head stops the run

- **WHEN** the batch changed at least one head
- **THEN** the run stops and later runs review the new heads once CI is green

#### Scenario: An empty batch continues

- **WHEN** no pull request is eligible for the batch
- **THEN** no head changes and the run continues to the landing or review step

#### Scenario: An all-refused batch continues

- **WHEN** every eligible entry was refused, for example a labeled fork branch or a conflict
- **THEN** the run continues to the landing or review step so reviews remain available

#### Scenario: A held lock does not stop review

- **WHEN** a `landing.lock` is held
- **THEN** the batch refuses and the run continues to review

#### Scenario: The batch limit leaves a remainder

- **WHEN** more than 20 pull requests are eligible
- **THEN** the batch applies 20 updates and leaves the remainder to the next run

#### Scenario: A slow head update is bounded

- **WHEN** an updated head is not visible within 10 seconds
- **THEN** the batch reports that pull request and continues with the next one

### Requirement: Batch sync command

The `sync-batch` command SHALL be a dry run by default, write branches only with `--apply`, and report for each evaluated pull request its number, previous head, new head when synced, and the refusal reason when skipped. It SHALL NOT publish a comment, add or remove a label, force-push, use admin, or create a landing entry.

#### Scenario: The default run is a dry run

- **WHEN** `sync-batch` runs without `--apply`
- **THEN** it reports the planned syncs and writes nothing

#### Scenario: Apply reports each pull request

- **WHEN** `sync-batch --apply` runs
- **THEN** it reports the previous and new head for each synced pull request and the refusal reason for each skipped one

#### Scenario: No comment, label or landing entry

- **WHEN** `sync-batch` completes
- **THEN** it publishes no comment, writes no label, does not force-push, does not use admin and creates no landing entry
