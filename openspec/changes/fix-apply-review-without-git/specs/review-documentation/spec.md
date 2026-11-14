# Spec Delta

## MODIFIED Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe, in one place: the purpose of review, the draft and apply objects, the phase boundaries, reviewer modes 0 and 1, the policy lock, the reviewer model sources (`inherit` and `explicit`) and the configuration page, the report and finding contract, severity, verdict, readiness, records, failure handling, configuration, and the no-git exception for apply review, including the `policy`/`enabled`/`available` status fields and the no-policy case.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains both review types and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that draft review uses the change artifacts and apply review uses the committed git tree

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for draft review
- **AND** it states that `openspec_archive` waits for apply review when the review is enabled and the project has git, and proceeds without it otherwise

#### Scenario: The document explains the no-git exception

- **WHEN** the reader reaches the apply object section
- **THEN** it states that a new policy created by this plugin in a project without git locks apply review disabled
- **AND** it states that a legacy policy may still record apply review enabled but status reports it unavailable
- **AND** it states that a change with no policy reports `policy: false` and archive does not wait

#### Scenario: The document explains the status fields

- **WHEN** the reader reaches the status description
- **THEN** it explains `policy`, `enabled` and `available`, including that unavailable takes precedence over an unset policy
