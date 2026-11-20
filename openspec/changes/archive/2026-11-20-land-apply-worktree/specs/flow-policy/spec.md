# Spec Delta

## ADDED Requirements

### Requirement: The flow rule names the land step

The registered flow rule SHALL state that a maintainer-authored worktree apply finishes with `openspec_apply_worktree action=land`, which merges, archives and commits in one lifecycle section, and that `openspec_archive` is not the terminal step for a change applied in a plugin-created apply worktree; a change merged through a pull request or a non-worktree change still uses `openspec_archive`.

#### Scenario: The rule names land

- **WHEN** the flow rule describes finishing a worktree apply
- **THEN** it names `openspec_apply_worktree action=land`

#### Scenario: The rule refuses main archive for a worktree change

- **WHEN** the flow rule describes archive
- **THEN** it states that a plugin-worktree change is archived by land, not by `openspec_archive`

#### Scenario: The rule keeps the external path

- **WHEN** the flow rule describes an external pull request
- **THEN** it states that the change is archived after merge with `openspec_archive`
