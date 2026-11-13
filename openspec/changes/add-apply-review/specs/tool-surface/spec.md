# tool-surface Specification Delta

## ADDED Requirements

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept `review: "apply"` for `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the commit, tree, base tree and readiness. The tool SHALL refuse an apply start outside a git repository.

#### Scenario: Apply review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "apply"` on a clean commit
- **THEN** the result names the review id, round, commit, tree and base tree

#### Scenario: Apply review is unavailable

- **WHEN** an agent requests apply review without git
- **THEN** the call fails with an actionable error

#### Scenario: Apply report is submitted

- **WHEN** an agent submits a valid apply report
- **THEN** the report is stored and the status reflects its verdict

### Requirement: Archive waits for a ready apply review

`openspec_archive` SHALL check the apply review before it reads the change list or runs validation. When apply review is enabled and not ready, the tool SHALL return no archive result and SHALL not move the change. When apply review is disabled or the project has no git, the tool SHALL proceed without that check.

#### Scenario: Apply review is not ready

- **WHEN** `openspec_archive` runs for a change whose apply review is not ready
- **THEN** the call fails, no file moves and the error names `openspec_review`

#### Scenario: Apply review is ready

- **WHEN** the apply review is ready and the tree matches
- **THEN** `openspec_archive` may proceed

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables apply review
- **THEN** `openspec_archive` proceeds without an apply check
