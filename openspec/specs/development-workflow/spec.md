# Development Workflow Specification

## Purpose

Defines how this repository plans, applies, and verifies its own changes with OpenSpec and the installed `openspec-flow` plugin.

## Requirements

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

The repository SHALL require OpenSpec validation, the plugin test suite, and the coverage gate before a change is considered complete.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec validate <name>` passes
- **AND** `npm test` passes on Node 24
- **AND** `npm run coverage:check` passes

### Requirement: Repository publishing

The repository SHALL publish `main` to the `origin` remote at `git@github.com:resec/dsh-openspec-flow.git` and SHALL keep `main` tracking `origin/main`.

#### Scenario: Publishing main

- **WHEN** a maintainer publishes the repository
- **THEN** `git remote get-url origin` prints `git@github.com:resec/dsh-openspec-flow.git` and `git rev-parse --abbrev-ref main@{upstream}` prints `origin/main`

### Requirement: Archive precedes commit and push

The repository SHALL commit and push only after `openspec_archive` has moved the change under `openspec/changes/archive/` and merged its delta specs, so the archive commit is the commit that carries the merged specs.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a change's tasks are incomplete or `openspec_validate` fails
- **THEN** no archive commit is created and `origin/main` receives nothing from that change

### Requirement: DSH runtime version alignment

The repository SHALL pin `engines.dsh` to the exact DSH runtime the plugin is verified against and SHALL set `engines.node` to the same lower bound declared by that DSH version.

#### Scenario: Manifest declares a DSH runtime

- **WHEN** a contributor edits `package.json` to declare the target DSH runtime
- **THEN** `engines.dsh` names one exact version with the `=` prefix
- **AND** `engines.node` uses the same lower bound as that DSH version's `engines.node`

#### Scenario: DSH dependency upgrade

- **WHEN** the targeted DSH version changes
- **THEN** the contributor reads the new DSH version's `engines.node` before editing `package.json`
- **AND** `engines.node` is re-aligned to that lower bound
- **AND** `engines.dsh` is updated to the new exact version
- **AND** the manifest passes the DSH compatibility check for that runtime

#### Scenario: Runtime mismatch is rejected

- **WHEN** the running DSH version differs from `engines.dsh`
- **THEN** DSH's install or startup check rejects the plugin unless the profile holds an exact-version exemption
