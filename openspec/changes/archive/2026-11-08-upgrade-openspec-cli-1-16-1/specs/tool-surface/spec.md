# tool-surface Delta

## ADDED Requirements

### Requirement: Delta section parsing reports the bundled CLI result

`openspec_validate`, `openspec_show` and `openspec_archive` SHALL return the bundled OpenSpec CLI's parse of delta spec sections without reinterpreting section headings or silently dropping misplaced requirements.

#### Scenario: Closed section heading is read

- **WHEN** a delta spec writes a section heading with a trailing `#` run, such as `## ADDED Requirements ##`
- **THEN** `openspec_show` lists the requirement as a delta
- **AND** `openspec_validate` reports the change valid

#### Scenario: Unrecognized requirement section fails validation

- **WHEN** a delta spec places a requirement under an unrecognized section such as `## DEPRECATED Requirements`
- **THEN** `openspec_validate` reports `valid: false` with an error naming the requirement
- **AND** `openspec_archive` returns `valid: false`, `archived: false` and the same issues without moving or rewriting files
