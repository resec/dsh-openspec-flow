## ADDED Requirements

### Requirement: The README names the optional apply baseline

The README `openspec_review` row SHALL name the optional `baseline` parameter with its `draft` default and `none` value.

#### Scenario: The README row names baseline

- **WHEN** a reader reads the `openspec_review` row in `README.md`
- **THEN** the row names the optional `baseline` and its `draft` default
- **AND** it names the `none` value

### Requirement: The review document describes the no-draft apply path

`docs/review.md` SHALL state that an explicit `baseline: "none"` skips the draft record, intent, plan-drift and plan-change-waiver checks; requires an explicit base; records the baseline; refuses a change with a draft record; records `none` for a draft-disabled policy; and keeps the draft-policy gate for the default path.

#### Scenario: The review document describes the no-draft path

- **WHEN** a reader reads the apply review section in `docs/review.md`
- **THEN** the document states which draft checks an explicit `none` baseline skips
- **AND** it states that the default path keeps the draft-policy gate

#### Scenario: The review document requires an explicit base

- **WHEN** the document describes an explicit `baseline: "none"`
- **THEN** it states that a non-empty `base` is required and that no merge-base fallback is used
- **AND** it states that a draft-disabled policy keeps its existing base fallback

#### Scenario: The review document refuses a no-draft review over a draft record

- **WHEN** the document describes an explicit `baseline: "none"`
- **THEN** it states that an existing draft record refuses the no-draft baseline

#### Scenario: The review document records the draft-disabled baseline

- **WHEN** the document describes a draft-disabled policy
- **THEN** it states that the apply record carries the `none` baseline

### Requirement: The review document describes the review ignore write

`docs/review.md` SHALL state that `openspec/.gitignore` is written only when git does not already ignore the review directory, and that a non-git project keeps writing it.

#### Scenario: The review document describes the ignore behavior

- **WHEN** the document describes review records and `openspec/.gitignore`
- **THEN** it states that the ignore line is written only when git does not already ignore the review directory

#### Scenario: The review document describes the non-git behavior

- **WHEN** the document describes a project without git
- **THEN** it states that the ignore line is still written
