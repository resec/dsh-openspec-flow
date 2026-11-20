# Spec Delta

## ADDED Requirements

### Requirement: The document states unique card delivery and batch lookup

`docs/review.md` SHALL state that the card endpoint returns each card file once even when several project roots share one review root, that it accepts a batch `turns` request answered as `byTurn`, that the client merges turn queries and falls back to single-turn requests on failure, that the per-session watermark matches sequential requests and is written once per directory per batch, and that git root resolution is cached per project root.

#### Scenario: The document states the card lookup rules

- **WHEN** `docs/review.md` is read
- **THEN** it states the unique per-file delivery across shared review roots
- **AND** it states the batch `turns` request and the `byTurn` answer
- **AND** it states the client merge and the single-turn fallback
- **AND** it states the watermark equivalence and the once-per-directory write
- **AND** it states that card files are selected by the session key in the file name
- **AND** it states that git root resolution is cached per project root

### Requirement: The README states the batch card request

The README review section SHALL state that `reviewCards/get` accepts a batch turn request, that each card file is returned once when project roots share a review root, and SHALL name `docs/review.md` for the lookup and delivery rules.

#### Scenario: The README names the batch lookup

- **WHEN** the README review section is read
- **THEN** it states the batch turn request and the unique card answer
- **AND** it names `docs/review.md` for the rules
