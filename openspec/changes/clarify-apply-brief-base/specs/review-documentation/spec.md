# Spec Delta: review-documentation

## ADDED Requirements

### Requirement: The review document states the apply brief base and diff scope

`docs/review.md` SHALL state that the apply brief names the base reference and identifies its source as the seal commit, an explicit base, or the merge base; that the diff starts at the base tree while the whole committed current tree is the review object; that an empty diff does not mean the change needs no implementation; and that `openspec_review` accepts an optional `base` for the explicit source.

#### Scenario: The reader reaches the apply brief description

- **WHEN** a reader reads the apply brief description in `docs/review.md`
- **THEN** the document names the three base sources and the diff scope
- **AND** it states that an empty diff does not mean the change needs no implementation
- **AND** it names the optional `base` parameter as the explicit source

### Requirement: The README `openspec_review` row names the optional base

The README `openspec_review` row SHALL name the optional `base` parameter for apply review.

#### Scenario: The reader scans the tool table

- **WHEN** a reader reads the `openspec_review` row in `README.md`
- **THEN** the row names the optional `base` for apply review

