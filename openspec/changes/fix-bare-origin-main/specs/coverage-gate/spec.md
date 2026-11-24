# Spec Delta

## MODIFIED Requirements

### Requirement: New-code coverage

For lines added or modified since `git merge-base refs/remotes/origin/main HEAD`, the gate SHALL require line coverage of at least 95.00 percent, branch coverage of at least 90.00 percent, and function coverage of 100.00 percent. Untracked source files SHALL count as fully new.

#### Scenario: New code misses a function

- **WHEN** one new function has no recorded call
- **THEN** the new-code function check fails

#### Scenario: No new executable code

- **WHEN** the diff contains no added or modified executable lines
- **THEN** the new-code checks report not applicable and do not fail

#### Scenario: A local branch shares the remote main's short name

- **WHEN** a local branch named `origin/main` points at a different commit than `refs/remotes/origin/main`
- **THEN** the merge base is computed from `refs/remotes/origin/main` and the local branch is ignored
