## ADDED Requirements

### Requirement: Bounded label-scoped listing

`candidates` and owner-review reconcile SHALL give their label (`mergeable`, `owner-review`) to `gh pr list` so GitHub, not a recent window, selects the entries, and SHALL read each listing under one fixed entry cap. When a listing returns as many entries as the cap, the command SHALL report the truncation with the entry count instead of dropping older labeled pull requests silently.

#### Scenario: The listing carries the label

- **WHEN** `candidates` or owner-review reconcile lists open pull requests
- **THEN** the `gh pr list` request carries that command's label and the fixed entry cap

#### Scenario: The listing reaches the cap

- **WHEN** a label-scoped listing returns as many entries as the cap
- **THEN** the command reports a truncation note with the entry count and lists no entry beyond it

#### Scenario: The listing stays below the cap

- **WHEN** a label-scoped listing returns fewer entries than the cap
- **THEN** the command reports no truncation note
