# Spec Delta

## ADDED Requirements

### Requirement: Instruction references are artifact ids

`openspec_instructions` SHALL return `dependencies` and `unlocks` as arrays of artifact ids. A dependency descriptor SHALL be reduced to its `id`; a string entry SHALL be preserved; an entry without an id SHALL be omitted. No entry SHALL be a serialized object such as "[object Object]".

#### Scenario: Dependencies are descriptors

- **WHEN** the CLI returns dependencies `[{id: "proposal", done: true, path: "proposal.md"}]`
- **THEN** `dependencies` is `["proposal"]`
- **AND** no entry contains "[object Object]"

#### Scenario: String unlock is preserved

- **WHEN** the CLI returns unlocks `["tasks"]`
- **THEN** `unlocks` is `["tasks"]`

#### Scenario: Entry without an id is omitted

- **WHEN** a dependency entry is an object without `id`, `artifactId` or `name`
- **THEN** the entry is omitted from `dependencies`
