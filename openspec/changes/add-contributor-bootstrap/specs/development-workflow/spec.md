# Spec Delta: development-workflow

## MODIFIED Requirements

### Requirement: Apply uses the installed plugin's compact loop

The repository SHALL use the `openspec-apply-change` skill and the `openspec_apply_next` / `openspec_mark_task_done` tools for maintainer-authored and plugin-driven apply. An external contribution whose implementation arrives with its change in one pull request SHALL record task completion in `tasks.md`, by hand or with the plugin, before merge.

#### Scenario: A task is completed

- **WHEN** a maintainer or plugin-driven apply completes a task
- **THEN** the task is marked with `openspec_mark_task_done` and the returned `next` is used without re-running `openspec_apply_next`

#### Scenario: An external contribution records completion

- **WHEN** an external contributor implements a task before opening the pull request
- **THEN** `tasks.md` records the completion, by hand or with the plugin
- **AND** the maintainer does not require `openspec_apply_next` for that pull request

### Requirement: Archive precedes commit and push

The repository SHALL archive a change before the archive commit is pushed to `origin/main`, so the archive commit carries the merged specs. A maintainer-authored change SHALL be archived before its implementation is pushed. An external contribution MAY merge its active change through a pull request; the maintainer SHALL archive it after merge, and the archive commit SHALL follow the apply review.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a maintainer-authored change's tasks are incomplete or `openspec_validate` fails
- **THEN** no archive commit is created and no implementation from that change is pushed

#### Scenario: An external contribution is merged before archive

- **WHEN** an external pull request carrying an active change is merged
- **THEN** the merge commit carries the active change
- **AND** the maintainer archives it after merge
- **AND** the archive commit follows the apply review

### Requirement: Repository changes pass the review gates

The repository SHALL run draft review before implementation for maintainer-authored changes, and before merge for an external contribution whose change artifacts and implementation arrive in one pull request. It SHALL run apply review after implementation is committed and before archive, and SHALL not archive a change whose apply review is not ready.

#### Scenario: A change starts implementation

- **WHEN** a maintainer starts apply
- **THEN** the draft review is ready or the apply tool refuses

#### Scenario: A change is archived

- **WHEN** a maintainer archives a change
- **THEN** the apply review is ready, or apply review is disabled or unavailable

#### Scenario: A review is not ready

- **WHEN** the draft or apply review reports a blocker
- **THEN** the change is not merged, implemented or archived until the blocker is fixed or waived

#### Scenario: An external contribution is reviewed

- **WHEN** a pull request carries an active change and its implementation together
- **THEN** the maintainer runs the draft review before merge
- **AND** runs the apply review before archive
