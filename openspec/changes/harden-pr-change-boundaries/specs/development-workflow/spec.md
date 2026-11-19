## ADDED Requirements

### Requirement: The repository root ignores the review root

The repository root `.gitignore` SHALL ignore `openspec/.review/`, so a review worktree that lacks the nested ignore file still keeps review records out of `git status`. The tracked `openspec/.gitignore` SHALL remain the project-level rule.

#### Scenario: The root rule is present

- **WHEN** a reader reads the repository root `.gitignore`
- **THEN** it contains an `openspec/.review/` entry

#### Scenario: A worktree without the nested file stays clean

- **WHEN** a git worktree has the root rule but no nested file, for example a branch that removed it or a sparse checkout, and a review record is written under `openspec/.review/`
- **THEN** `git status --porcelain` reports no review path

#### Scenario: The nested rule remains

- **WHEN** the repository tracks `openspec/.gitignore`
- **THEN** that file still contains the `.review/` entry
