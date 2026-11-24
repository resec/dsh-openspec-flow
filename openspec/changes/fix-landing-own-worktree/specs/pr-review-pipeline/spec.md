# Spec Delta

## ADDED Requirements

### Requirement: Landing checkout separation

The landing command SHALL keep its rebased checkout in its own worktree at `.cache/pr-review/worktrees/pr-<n>-land` and SHALL NOT reuse, modify or remove the review watch checkout at `.cache/pr-review/worktrees/pr-<n>`. Abandoning, finishing or forgetting a landing SHALL remove only the landing checkout, and the watch entry SHALL keep the checkout it names until the pull request is closed or merged.

#### Scenario: Prepare creates a separate checkout

- **WHEN** `prepare <n> --apply` creates a landing for a reviewed pull request
- **THEN** the landing branch is checked out at `pr-<n>-land` and the watch checkout `pr-<n>` is unchanged

#### Scenario: Abandon keeps the review checkout

- **WHEN** a prepared landing is abandoned while the pull request is open
- **THEN** the landing checkout is removed, the watch entry still names `pr-<n>`, and that directory still exists

#### Scenario: A landing recorded on the watch checkout is rebuilt

- **WHEN** `prepare` finds a landing entry whose recorded checkout is not `pr-<n>-land`
- **THEN** it records the landing at `pr-<n>-land`, leaves the previously recorded checkout in place, and the operator removes that old directory manually

#### Scenario: The previous checkout is not clean

- **WHEN** `prepare` rebuilds a landing and the previously recorded checkout has local changes
- **THEN** it refuses with that checkout path and leaves both the checkout and the landing entry unchanged
