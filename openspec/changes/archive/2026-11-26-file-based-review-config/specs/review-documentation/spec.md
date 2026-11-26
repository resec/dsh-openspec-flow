# Spec Delta

## MODIFIED Requirements

### Requirement: The document matches configuration defaults

The document SHALL list the default review configuration written by `openspec_init`: a `directory` profile used by draft and a `tree` profile used by apply, each with enabled true, reviewers 0, waitMinutes 15 and reviewer model inherit. It SHALL state that draft and apply reviews have no round cap and that no round-cap key exists in the project review file or the row config.

#### Scenario: A default changes

- **WHEN** a contributor changes a default profile value in the code
- **THEN** the documentation test fails until `docs/review.md` is updated

#### Scenario: A key is renamed

- **WHEN** a project review file key is renamed in the code
- **THEN** the documentation test names the stale key

#### Scenario: A round cap is documented

- **WHEN** the document lists a `maxRounds` key or a round-cap default
- **THEN** the documentation test fails

## ADDED Requirements

### Requirement: The document states the project review file

`docs/review.md` SHALL state that `openspec/reviews.json` is the project's source of review parameters, its `profiles` and `reviews` shape, the draft and apply entry names, their object types, and the first-lock `configPath` exception.

#### Scenario: The file layout is described

- **WHEN** a reader looks up how to configure a review
- **THEN** the document names `openspec/reviews.json`, both entry names, the two object types, the `configPath` exception and a minimal example

### Requirement: The document states the file failure and locking boundary

`docs/review.md` SHALL state that a missing or invalid file fails change creation and review start unless `reviewEnabled` is false or the call supplies `configPath`, that the policy records the source path, hash and profile names, that file edits affect only new changes, that no relock exists, that the row config's `reviews` section is ignored and reported, that `reviewEnabled` is the only review switch left, and that the configuration page is read-only.

#### Scenario: The failure behavior is described

- **WHEN** a reader looks up a missing or invalid file
- **THEN** the document states that change creation and review start fail instead of falling back to defaults, and names the two exceptions

#### Scenario: The migration is described

- **WHEN** a reader looks up the row config's `reviews` section
- **THEN** the document states that the section is ignored and reported, and names `openspec/reviews.json` as the replacement

#### Scenario: The locking boundary is described

- **WHEN** a reader looks up what happens to a locked change
- **THEN** the document states that the policy snapshot and the source hash are recorded, that edits affect only new changes, and that no relock exists

### Requirement: The README states the project review file

`README.md` SHALL state that review parameters come from `openspec/reviews.json`, that `openspec_init` writes the default file, that a missing or invalid file fails review instead of falling back to defaults unless `reviewEnabled` is false or the call supplies `configPath`, that the row config keeps only the global `reviewEnabled` switch, and SHALL name `docs/review.md` for the file layout.

#### Scenario: A reader looks up review configuration

- **WHEN** a reader opens the README review section
- **THEN** it names the project review file and the read-only page

#### Scenario: The README drifts from the code

- **WHEN** the row config switch or the file path changes in the code
- **THEN** the documentation test fails until the README matches
