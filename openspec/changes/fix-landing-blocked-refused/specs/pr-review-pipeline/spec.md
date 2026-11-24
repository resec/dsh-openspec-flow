# Spec Delta

## MODIFIED Requirements

### Requirement: Landing candidate discovery

`scripts/pr-review-land.mjs candidates` SHALL be read-only and list open pull requests that carry the `mergeable` label, whose watch entry records the current head as `commented`, that satisfy every landing gate, for which no other landing is unfinished, and whose own landing is not in a stopped phase, which SHALL be refused with its phase, error and recovery. It SHALL report the first refusal reason for a pull request that fails a gate, and a dirty main worktree once for the whole listing.

#### Scenario: Eligible labeled pull request

- **WHEN** an open pull request carries `mergeable`, its watch entry records the current head as `commented`, every landing gate passes, no other landing is unfinished and its own landing is not in a stopped phase
- **THEN** `candidates` lists it with its number, head, change and base

#### Scenario: Refused pull request

- **WHEN** an open pull request lacks the label, has an uncommented or moved watch entry, or fails another gate
- **THEN** `candidates` does not list it and reports the first refusal reason

#### Scenario: Another landing is unfinished

- **WHEN** another pull request holds an unfinished landing
- **THEN** `candidates` does not list this pull request and reports the unfinished landing

#### Scenario: Own landing recorded review-failed

- **WHEN** a pull request's own landing is in the `review-failed` phase
- **THEN** `candidates` does not list it and reports the recorded failure

#### Scenario: Own landing blocked by a rebase conflict

- **WHEN** a pull request's own landing is in the `blocked` phase
- **THEN** `candidates` does not list it and reports the recorded rebase conflict with the recovery of rerunning `prepare` after resolving it or removing the label

#### Scenario: Own landing stopped before the merge

- **WHEN** a pull request's own landing is in the `failed` or `tree-mismatch` phase
- **THEN** `candidates` does not list it and reports that phase with its recorded error

#### Scenario: Unnamed stopped phase

- **WHEN** a pull request's own landing records a phase the listing does not know as open
- **THEN** `candidates` does not list it and reports the recorded phase

#### Scenario: Dirty main worktree

- **WHEN** the main worktree is not clean
- **THEN** `candidates` reports the dirty worktree once and lists no pull request

#### Scenario: Listing writes nothing

- **WHEN** `candidates` runs
- **THEN** it writes no watch or landing state and leaves the pull request unchanged
