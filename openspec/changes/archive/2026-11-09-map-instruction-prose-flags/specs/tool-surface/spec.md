# Spec Delta

## ADDED Requirements

### Requirement: Instruction text names tool parameters

`openspec_instructions` SHALL rewrite CLI flags in the built-in schema instruction into the corresponding tool parameter syntax, so the returned `instruction` contains no `--store`, `--type` or `--specs` flag. The rewrite SHALL apply only to `instruction`; configured `context` and `rules` SHALL be returned unchanged.

#### Scenario: Store flag in prose

- **WHEN** the instruction returns text containing "Append `--store \"<id>\"`"
- **THEN** the text contains `store: "<id>"` instead
- **AND** it contains no `--store`

#### Scenario: Type flag split across lines

- **WHEN** the instruction wraps "`--type`" and "spec`" across two lines
- **THEN** the text contains `type: "spec"` instead
- **AND** it contains no `--type`

#### Scenario: Specs flag in prose

- **WHEN** the instruction returns text containing "without `--specs`"
- **THEN** the text contains `specs: true` instead
- **AND** it contains no `--specs`

#### Scenario: Bare store flag

- **WHEN** the instruction returns text containing "came from `--store`"
- **THEN** the text contains "came from `store`" instead
- **AND** it contains no `--store`

#### Scenario: Configured project text is not rewritten

- **WHEN** the project sets `context` or `rules` containing `--store`
- **THEN** those fields are returned verbatim
- **AND** only `instruction` is rewritten
