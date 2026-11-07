# tool-surface Specification

## ADDED Requirements

### Requirement: Task marking accepts a batch

`openspec_mark_task_done` SHALL accept one or more task ids in a single call and SHALL report one result entry per distinct task, in input order. A task whose checkbox this call changed SHALL report `flipped`; a task that was already complete SHALL report `already-done`.

#### Scenario: Several finished tasks are marked together

- **WHEN** the tool receives three pending task ids
- **THEN** all three checkboxes become checked in one call
- **AND** `results` lists the three ids with status `flipped` in input order
- **AND** `next` names the first remaining pending task

#### Scenario: A mixed batch keeps a status per task

- **WHEN** one id is already complete and one id is pending
- **THEN** `results` reports `already-done` for the completed id and `flipped` for the pending one

#### Scenario: A duplicate id is reported once

- **WHEN** the same id appears twice in `taskIds`
- **THEN** the checkbox flips once and `results` carries one entry for that task

#### Scenario: A single task is a one-element batch

- **WHEN** `taskIds` contains one id
- **THEN** the call returns one result entry and the same progress, state and next fields as a batch

### Requirement: Batch marking changes nothing unless every id resolves

`openspec_mark_task_done` SHALL resolve every id against the cached apply state and its tracking file before writing. When any id does not resolve to a task, the call SHALL fail with the missing ids and SHALL leave every checkbox unchanged.

#### Scenario: Unknown id in a batch

- **WHEN** `taskIds` includes an id that no tracking file contains
- **THEN** the call fails and names the missing ids
- **AND** no checkbox changes, including those whose ids were valid

#### Scenario: Tracking file changed outside the tool

- **WHEN** an id no longer resolves at its cached location because the tracking file changed
- **THEN** the tool refreshes the apply state once before deciding that the id is missing

#### Scenario: A corrected batch is marked in full

- **WHEN** the agent resends the batch with the missing id corrected
- **THEN** every id resolves and the whole batch is marked
