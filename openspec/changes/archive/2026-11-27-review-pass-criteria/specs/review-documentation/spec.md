# Spec Delta

## MODIFIED Requirements

### Requirement: The document matches configuration defaults

The document SHALL list the default review configuration written by `openspec_init`: a `directory` profile used by `draft` and a `tree` profile used by `apply`, each with enabled true, reviewers 0, waitMinutes 15 and reviewer model inherit, plus the pipeline `beforeApply: "draft"` and `beforeArchive: "apply"`. It SHALL state that reviews have no round cap and that no round-cap key exists in the project review file or the row config.

#### Scenario: A default changes

- **WHEN** a contributor changes a default profile value in the code
- **THEN** the documentation test fails until `docs/review.md` is updated

#### Scenario: A key is renamed

- **WHEN** a project review file key is renamed in the code
- **THEN** the documentation test names the stale key

#### Scenario: A round cap is documented

- **WHEN** the document lists a `maxRounds` key or a round-cap default
- **THEN** the documentation test fails

#### Scenario: The optional defaults are documented

- **WHEN** the document lists the default profile values
- **THEN** it names `passCriteria: "major"`, `allowDeferred: true` and `allowRejected: true`

### Requirement: The document states the refined card display

`docs/review.md` SHALL state that the collapsed summary counts findings by severity and shows no next action, that the card payload counts `verifiedDeferred` and `verifiedRejected` findings, that unrecorded optional finding and disposition rows are omitted, and that same-state readiness reasons are merged into one line.

#### Scenario: A reader reaches the refined card description

- **WHEN** a reader reads the card section of `docs/review.md`
- **THEN** the document states the per-severity summary without a next action
- **AND** it states that unrecorded optional rows are omitted
- **AND** it states that same-state readiness reasons are merged

#### Scenario: The card counts the new terminal statuses

- **WHEN** a reader reaches the card count description
- **THEN** the document names `verifiedDeferred` and `verifiedRejected` among the card payload counts

### Requirement: The review document states the shared brief report contract

`docs/review.md` SHALL state that every entry's brief renders one report contract for the current round from the same source, and that the contract names the finding id rule, the verification statuses and when verifications are empty.

#### Scenario: Document describes the shared contract

- **WHEN** a reader opens the review document
- **THEN** it states that every entry's brief renders one round-aware report contract from the same source
- **AND** it names the finding id rule and the empty-verifications first-round case

#### Scenario: The document names the new verification statuses

- **WHEN** a reader opens the brief contract description
- **THEN** the document names `verified-deferred` and `verified-rejected` beside the existing verification statuses
- **AND** it states that the contract names the pass criteria and disposition switches

### Requirement: The README states the project review file

`README.md` SHALL state that review parameters come from `openspec/reviews.json`, that `openspec_init` writes the default file, that `reviews` entries name profiles whose `object` selects the flow, that `pipeline` names the apply and archive gate entries with `draft`/`apply` defaults, that a missing or invalid file fails review instead of defaulting unless `reviewEnabled` is false or the call supplies `configPath`, that the row config keeps only `reviewEnabled`, and SHALL name `docs/review.md`.

#### Scenario: A reader looks up review configuration

- **WHEN** a reader opens the README review section
- **THEN** it names the project review file, the entry table, the pipeline and the read-only page

#### Scenario: The README drifts from the code

- **WHEN** the row config switch or the file path changes in the code
- **THEN** the documentation test fails until the README matches

#### Scenario: The README names the optional fields

- **WHEN** the README review section describes the profile parameters
- **THEN** it names `passCriteria`, `allowDeferred` and `allowRejected` with their defaults

#### Scenario: The README states the readiness rule

- **WHEN** the README review section describes readiness
- **THEN** it states that only in-threshold findings block readiness
- **AND** it states that `pass` requires every in-threshold finding resolved

## ADDED Requirements

### Requirement: The document states the pass criteria and finding resolution

`docs/review.md` SHALL state the severity order, the `passCriteria` threshold and its default, the disposition table for in-threshold and below-threshold findings, the `allowDeferred` and `allowRejected` switches, the full finding status list, the readiness and report verdict rules, and the `verifiedDeferred`/`verifiedRejected` counts.

#### Scenario: The threshold is documented

- **WHEN** a reader reaches the finding contract
- **THEN** the document states the severity order and that findings at or above `passCriteria` are in-threshold
- **AND** it names the default `major`

#### Scenario: The disposition table is documented

- **WHEN** a reader looks up finding dispositions
- **THEN** the document states that an in-threshold finding can only be fixed or user-waived
- **AND** it states that a below-threshold finding can be deferred or rejected only when its switch is true

#### Scenario: The finding statuses are documented

- **WHEN** a reader looks up finding statuses
- **THEN** the document lists `verified-deferred` and `verified-rejected` and states how `still-open` returns a finding to `open`

#### Scenario: Readiness and the report verdict are documented

- **WHEN** a reader looks up readiness
- **THEN** the document states that only in-threshold findings block readiness
- **AND** it states that `pass` requires every in-threshold finding resolved and `changes-requested` requires an unresolved in-threshold finding

#### Scenario: The status counts are documented

- **WHEN** a reader looks up the review status counts
- **THEN** the document names `verifiedDeferred` and `verifiedRejected`
- **AND** it states that `blocking` counts unresolved in-threshold findings
