# Spec Delta

## MODIFIED Requirements

### Requirement: The repository root ignores the review root

The repository root `.gitignore` SHALL keep ignoring the legacy review root `openspec/.review/`, so a worktree that lacks the nested ignore file still keeps legacy records out of `git status`. The shared review root lives under the git common directory, outside every worktree, so it needs no worktree ignore entry. The tracked `openspec/.gitignore` SHALL remain the project-level legacy rule.

#### Scenario: The root rule is present

- **WHEN** a reader reads the repository root `.gitignore`
- **THEN** it contains an `openspec/.review/` entry

#### Scenario: A worktree without the nested file stays clean

- **WHEN** a git worktree has the root rule but no nested file, for example a branch that removed it or a sparse checkout, and a legacy review record is written under `openspec/.review/`
- **THEN** `git status --porcelain` reports no review path

#### Scenario: The nested rule remains

- **WHEN** the repository tracks `openspec/.gitignore`
- **THEN** that file still contains the `.review/` entry

#### Scenario: The shared root is outside the worktree

- **WHEN** a review record is written under `<git common dir>/openspec-flow/review/`
- **THEN** it is not a worktree path and needs no `.gitignore` entry
