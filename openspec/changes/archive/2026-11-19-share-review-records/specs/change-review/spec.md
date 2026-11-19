# Spec Delta

## MODIFIED Requirements

### Requirement: Review records live under the OpenSpec review root

The plugin SHALL store legacy review records at `openspec/.review/<store>#<change>/` when the project has no git repository or its git common directory cannot be resolved, using `local#<change>` when no store is selected. It SHALL ensure `openspec/.gitignore` contains `.review/` unless `git check-ignore` already accepts the legacy directory. In a git repository, it SHALL verify before writing that `git check-ignore` accepts the path.

#### Scenario: First review creates the record root

- **WHEN** a review starts for a project without git, or a git project whose common directory cannot be resolved, and no rule ignores the legacy root
- **THEN** the plugin creates the directory and adds `.review/` to `openspec/.gitignore`

#### Scenario: A repository rule already ignores the review directory

- **WHEN** `git check-ignore` already accepts the legacy review directory
- **THEN** the plugin creates the directory and writes no `openspec/.gitignore`

#### Scenario: Record path is ignored

- **WHEN** the project is a git repository, uses the legacy root, and the record path is not ignored
- **THEN** the review start fails with an actionable error instead of writing a tracked legacy record

#### Scenario: The nested ignore file already covers the review directory

- **WHEN** `openspec/.gitignore` already contains the `.review/` line
- **THEN** the plugin writes no file

#### Scenario: Non-git projects keep the write behavior

- **WHEN** the project has no git repository
- **THEN** the plugin keeps writing the legacy ignore line

#### Scenario: A failed ignore check is conservative

- **WHEN** the git ignore check fails for a reason other than a clean miss on the legacy root
- **THEN** the plugin writes the ignore line instead of skipping it

#### Scenario: Store-scoped change

- **WHEN** a change belongs to a registered store
- **THEN** its review directory name is `<store>#<change>`

## ADDED Requirements

### Requirement: Git review records are shared across worktrees

The plugin SHALL store review records for a git project at `<git common dir>/openspec-flow/review/<store>#<change>/`, using `local#<change>` when no store is selected. A nested OpenSpec root SHALL append a stable suffix to the record name. The shared root SHALL skip the worktree ignore check.

#### Scenario: A git project uses the shared root

- **WHEN** a review starts for a change in a git project
- **THEN** the plugin writes the record under `<git common dir>/openspec-flow/review/<store>#<change>/`

#### Scenario: The shared root skips the worktree ignore check

- **WHEN** a review starts for a change in a git project
- **THEN** the plugin neither writes `openspec/.gitignore` nor runs the git check-ignore gate for the shared record

#### Scenario: Linked worktrees share one record

- **WHEN** the main worktree and a linked worktree resolve the same change's review record
- **THEN** both resolve the same directory under the git common directory

#### Scenario: A nested root gets a distinct record

- **WHEN** two nested OpenSpec roots of one repository define a change with the same name
- **THEN** their record names differ by the stable nested-root suffix

### Requirement: A legacy review record is copied once

The plugin SHALL copy a legacy review record to the shared root once when neither a shared record nor a migration marker exists, write a marker, and SHALL NOT restore a shared record the user removed. The legacy copy SHALL remain.

#### Scenario: A legacy record is copied once

- **WHEN** the shared root has no record for a change, the legacy root has one, and no migration marker exists
- **THEN** the plugin copies the legacy record to the shared root and writes a migration marker

#### Scenario: A removed shared record stays removed

- **WHEN** a shared record was migrated and the user removes it to restart the review
- **THEN** the next access does not copy the retained legacy record back

#### Scenario: The legacy copy remains

- **WHEN** the plugin copies a legacy record to the shared root
- **THEN** the legacy directory and its files remain in place
