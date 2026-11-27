# Spec Delta: review entry model

## MODIFIED Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe: the purpose of review, the entry table and pipeline, the directory and tree review objects, how an entry's profile `object` selects its flow, the phase boundaries, concurrent reviews, the serial apply lock, reviewer modes and models, policy locking and configuration, the report and finding contract, severity, verdict, readiness, records, failure handling, the no-git exception and the `policy`/`enabled`/`available`, `mode` and `independent` status fields.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains the directory and tree flows and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that a directory entry reviews the change artifacts and a tree entry the committed git tree
- **AND** it states that the entry name does not select the flow

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for the `pipeline.beforeApply` entry
- **AND** it states that a git worktree apply seals the draft at the first apply with a commit the plugin constructs on the apply branch
- **AND** it states that `openspec_archive` waits for the `pipeline.beforeArchive` entry when that entry is enabled and the project has git, and proceeds without it otherwise

#### Scenario: The document explains the phase boundary

- **WHEN** the reader reaches the phase boundary
- **THEN** it states that a directory entry can be resumed before apply started and cannot be resumed after
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
- **THEN** it states that a new policy created by this plugin in a project without git locks every tree entry disabled
- **AND** it states that a legacy policy may still record a tree entry enabled but status reports it unavailable
- **AND** it states that a change with no policy reports `policy: false` and archive does not wait

#### Scenario: The document explains the status fields

- **WHEN** the reader reaches the status description
- **THEN** it explains `policy`, `enabled` and `available`, including that unavailable takes precedence over an unset policy
- **AND** it explains `mode` and `independent`: the locked `reviewers` value determines them for an enabled and available entry, a disabled or unavailable entry reports `self`/`false`, and a recorded review reports its recorded values

#### Scenario: The document explains the frozen reviewer

- **WHEN** the reader reaches the reviewer section
- **THEN** it states that the reviewer runs the installed plugin artifact
- **AND** it states that editing plugin sources does not change the installed copy or reload the reviewer
- **AND** it states that new plugin logic takes effect only after a reinstall

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

### Requirement: The document matches the record layout

The document SHALL state the legacy review root `openspec/.review/<store>#<change>/`, the records `review.json`, `apply-review.json` and `<entry>-review.json`, the round directories `round-N`, `apply-round-N` and `<entry>-round-N`, the `cards/<sessionKey>-<kind>-<phase>-<round>.json` layout with the entry name as `kind`, the short session key and the earlier kind-less card name, the `cards` marker and delivery watermark, the apply lock locations and fields, and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: An entry record is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the `draft`/`apply` names and the `round-N`, `apply-round-N` and `<entry>-round-N` forms

#### Scenario: The earlier card name is documented

- **WHEN** a reader looks up the earlier card name
- **THEN** the document states that the kind-less name stays readable

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports

#### Scenario: The card layout is documented

- **WHEN** the card file directory or name pattern changes
- **THEN** the documentation test fails until `docs/review.md` describes the new layout

### Requirement: The document explains the card surface

The document SHALL explain the card files and the `<reviewDir>/card-delivery.json` watermark, the `reviewCards/get` endpoint and turn binding, the `conversation.chat.turnTail` query and rendering, the collapsed and expanded card, the entry name as the card kind, the complete expanded report, the plan-change waiver section, the no-truncation and no-pagination rule, the fixed Chinese labels, the write points and the fact that no card data enters the session log or the model-visible surface.

#### Scenario: A reader opens the review document

- **WHEN** a reader reaches the review-card section
- **THEN** it names the card files, the entry kind, the endpoint and the turn-tail rendering
- **AND** it states that the expanded card contains the full report body and the plan-change waiver
- **AND** it states that the expanded card does not truncate or paginate
- **AND** it states that no card data enters the session log or the model-visible surface

#### Scenario: A write point changes

- **WHEN** a card write point is added or removed in code
- **THEN** the documentation test fails until the document lists the new set

### Requirement: The document states the project review file

`docs/review.md` SHALL state that `openspec/reviews.json` is the project's source of review parameters, its `profiles`, `reviews` and `pipeline` shape, that entry names are arbitrary kebab-case names and not limited to `draft` and `apply`, that an entry's profile `object` selects the flow, the `beforeApply` and `beforeArchive` defaults, and the first-lock `configPath` exception.

#### Scenario: The file layout is described

- **WHEN** a reader looks up how to configure a review
- **THEN** the document names `openspec/reviews.json`, the profiles, the entries, the pipeline, both object types, the `configPath` exception and a minimal example that includes a non-default entry

### Requirement: The README states the project review file

`README.md` SHALL state that review parameters come from `openspec/reviews.json`, that `openspec_init` writes the default file, that `reviews` entries name profiles whose `object` selects the flow, that `pipeline` names the apply and archive gate entries with `draft`/`apply` defaults, that a missing or invalid file fails review instead of defaulting unless `reviewEnabled` is false or the call supplies `configPath`, that the row config keeps only `reviewEnabled`, and SHALL name `docs/review.md`.

#### Scenario: A reader looks up review configuration

- **WHEN** a reader opens the README review section
- **THEN** it names the project review file, the entry table, the pipeline and the read-only page

#### Scenario: The README drifts from the code

- **WHEN** the row config switch or the file path changes in the code
- **THEN** the documentation test fails until the README matches

### Requirement: The document states the attempt revision layout

`docs/review.md` SHALL state that a refreshed directory round keeps its previous attempts under `round-N/revisions/MM/`, and another entry under `<entry>-round-N/revisions/MM/`, as `brief.md`, an optional `report.json` and the recorded hashes, cause and archive time, and that the review record lists them in a `revisions` array.

#### Scenario: The layout is documented

- **WHEN** a reader looks up where a replaced attempt is stored
- **THEN** the document names the `round-N/revisions/MM/` form and the record's `revisions` array

#### Scenario: The preserved facts are documented

- **WHEN** a reader looks up the audit facts
- **THEN** the document names the brief, hashes, optional blocked report, cause and archive time

### Requirement: The review document states the shared brief report contract

`docs/review.md` SHALL state that every entry's brief renders one report contract for the current round from the same source, and that the contract names the finding id rule, the verification statuses and when verifications are empty.

#### Scenario: Document describes the shared contract

- **WHEN** a reader opens the review document
- **THEN** it states that every entry's brief renders one round-aware report contract from the same source
- **AND** it names the finding id rule and the empty-verifications first-round case

### Requirement: The document states the file failure and locking boundary

`docs/review.md` SHALL state that a missing or invalid file fails creation and review start except with `reviewEnabled: false` or `configPath`; source facts recorded; that edits affect only new changes and never relock; that a legacy policy reads with defaults, and the first start or resume with `configPath` SHALL supplement it once with schema 3 and added objects, no source/legacy object; that the row `reviews` section is ignored; `reviewEnabled` is the only switch; and the page is read-only.

#### Scenario: The failure behavior is described

- **WHEN** a reader looks up a missing or invalid file
- **THEN** the document states that change creation and review start fail instead of falling back to defaults, and names the two exceptions

#### Scenario: The migration is described

- **WHEN** a reader looks up the row config's `reviews` section
- **THEN** the document states that the section is ignored and reported, and names `openspec/reviews.json` as the replacement

#### Scenario: The locking boundary is described

- **WHEN** a reader looks up what happens to a locked change
- **THEN** the document states that the policy snapshot and the source hash are recorded, that edits affect only new changes, and that no relock exists

#### Scenario: The legacy supplement is described

- **WHEN** a reader looks up a legacy policy
- **THEN** the document states the default reading and the one-time `configPath` supplement, including its schema version and the facts it does not add

