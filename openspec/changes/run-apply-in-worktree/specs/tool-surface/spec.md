# Spec Delta

## ADDED Requirements

### Requirement: Apply tools expose the worktree and the session directory

`openspec_apply_next` SHALL return `worktree` with a path relative to `root.path`, branch, base and main root; `root.path` SHALL remain the main root. It SHALL move the changer session to the worktree before returning. `openspec_mark_task_done` and `openspec_inspect` `action: "validate"` SHALL use the worktree; the other inspect actions SHALL stay on main. `openspec_review` SHALL accept an optional `worktree` for apply review and activate the independent reviewer there.

#### Scenario: Apply next names the worktree and main root

- **WHEN** `openspec_apply_next` runs for a git change
- **THEN** `root.path` is the main root and `worktree.path` is relative to `root.path`

#### Scenario: Follow-up tools use the worktree

- **WHEN** `openspec_mark_task_done` or the validate action runs after apply starts
- **THEN** it uses the recorded worktree

#### Scenario: Other reads stay on main

- **WHEN** `openspec_inspect` runs `list`, `status`, `show`, `instructions` or `context`
- **THEN** it reads main

#### Scenario: Apply review uses the worktree

- **WHEN** `openspec_review` starts an apply review for a worktree-applied change
- **THEN** the reviewer is activated in that worktree

#### Scenario: An explicit worktree is accepted

- **WHEN** `openspec_review` receives a clean existing branch worktree
- **THEN** it runs the apply review there
