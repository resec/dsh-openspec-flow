# Spec Delta

## MODIFIED Requirements

### Requirement: Apply uses the installed plugin's compact loop

The repository SHALL use the `openspec-apply-change` skill and the `openspec_apply_next` / `openspec_mark_task_done` tools for apply.

#### Scenario: A task is completed

- **WHEN** a task's specified behavior is fully implemented
- **THEN** the task is marked with `openspec_mark_task_done` and the returned `next` is used without re-running `openspec_apply_next`
