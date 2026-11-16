# review-documentation Delta

## MODIFIED Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe, in one place: the purpose of review, the draft and apply objects, the phase boundaries, concurrent draft reviews across changes, the serial apply lock from apply through archive, reviewer modes 0 and 1, the policy lock, the reviewer model sources (`inherit` and `explicit`) and the configuration page, the report and finding contract, severity, verdict, readiness, records, failure handling, configuration, and the no-git exception for apply review, including the `policy`/`enabled`/`available` status fields and the no-policy case.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains both review types and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that draft review uses the change artifacts and apply review uses the committed git tree

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for draft review
- **AND** it states that a git project seals the draft with a commit that contains the change directory, its OpenSpec ignore file and may contain other `openspec/changes/` paths
- **AND** it states that `openspec_archive` waits for apply review when the review is enabled and the project has git, and proceeds without it otherwise

#### Scenario: The document explains the phase boundary

- **WHEN** the reader reaches the phase boundary
- **THEN** it states that the draft review can be resumed before apply started and cannot be resumed after
- **AND** it states that a plan change during apply needs the user's written waiver

#### Scenario: The document explains the concurrency contract

- **WHEN** the reader reaches the concurrency section
- **THEN** it states that several changes may hold draft reviews at the same time
- **AND** it states that one change applies and archives at a time
- **AND** it states that another change's apply entry is refused while the lock is held, while its draft review remains available
- **AND** it states that another change's uncommitted planning files do not block the holding change's seal, apply review or archive
- **AND** it states that each lock lives in its domain's worktree git directory or under `openspec/.review/`; a store change also uses its store domain, and a session outside every root uses the change root
- **AND** it states that a store change applied from another project is refused until the first project archives

#### Scenario: The document explains the manual release

- **WHEN** the reader looks for how to unblock a paused change
- **THEN** it states that removing every lock file named in the refusal releases the locks
- **AND** it states where the lock files live
- **AND** it states that only the user may remove them and the agent must ask the user
- **AND** it states that the next apply entry acquires fresh locks

#### Scenario: The document explains the no-git exception

- **WHEN** the reader reaches the apply object section
- **THEN** it states that a new policy created by this plugin in a project without git locks apply review disabled
- **AND** it states that a legacy policy may still record apply review enabled but status reports it unavailable
- **AND** it states that a change with no policy reports `policy: false` and archive does not wait

#### Scenario: The document explains the status fields

- **WHEN** the reader reaches the status description
- **THEN** it explains `policy`, `enabled` and `available`, including that unavailable takes precedence over an unset policy

#### Scenario: The document explains the frozen reviewer

- **WHEN** the reader reaches the reviewer section
- **THEN** it states that the reviewer runs the installed plugin artifact
- **AND** it states that editing plugin sources does not change the installed copy or reload the reviewer
- **AND** it states that new plugin logic takes effect only after a reinstall

### Requirement: The document matches the record layout

The document SHALL state the review root `openspec/.review/<store>#<change>/`, the draft and apply record files, the apply lock locations (the implementation domain's worktree git directory or `openspec/.review/`, plus a store change's store domain) with their `schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot` and `startedAt` fields, and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports
