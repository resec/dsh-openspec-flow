## Purpose

Defines how this repository plans, applies, and verifies its own changes with OpenSpec and the installed `openspec-flow` plugin.

## ADDED Requirements

### Requirement: OpenSpec changes drive plugin development

The repository SHALL plan non-trivial plugin work as an OpenSpec change under `openspec/changes/<name>/` before implementation.

#### Scenario: A non-trivial change starts

- **WHEN** a contributor starts a feature or a behavior change
- **THEN** the change has a proposal, a task list, and any required spec or design artifact before code edits

### Requirement: Apply uses the installed plugin's compact loop

The repository SHALL use the `openspec-flow` skill and the `openspec_apply_next` / `openspec_mark_task_done` tools for apply.

#### Scenario: A task is completed

- **WHEN** a task's specified behavior is fully implemented
- **THEN** the task is marked with `openspec_mark_task_done` and the returned `next` is used without re-running `openspec_apply_next`

### Requirement: Verification gates a change

The repository SHALL require OpenSpec validation and the plugin test suite before a change is considered complete.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec validate <name>` passes and `node --test test/` passes
