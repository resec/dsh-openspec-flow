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

The repository SHALL use the `openspec-apply-change` skill and the `openspec_apply_next` / `openspec_mark_task_done` tools for apply.

#### Scenario: A task is completed

- **WHEN** a task's specified behavior is fully implemented
- **THEN** the task is marked with `openspec_mark_task_done` and the returned `next` is used without re-running `openspec_apply_next`

### Requirement: Verification gates a change

The repository SHALL require strict OpenSpec validation, the plugin test suite, and the coverage gate before a change is considered complete. Strict validation SHALL treat every warning as a failure.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec_validate` passes with `strict: true`
- **AND** `npm test` passes on Node 24
- **AND** `npm run coverage:check` passes

#### Scenario: A validation warning is present

- **WHEN** the change or a main spec reports a warning
- **THEN** strict validation fails and the change is not complete

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

The repository SHALL pin `engines.dsh` to the exact DSH runtime the plugin is verified against and SHALL set `engines.node` to the bound recorded in `project-invariants`, which is that DSH version's declared lower bound.

#### Scenario: Manifest declares a DSH runtime

- **WHEN** a contributor edits `package.json` to declare the target DSH runtime
- **THEN** `engines.dsh` names one exact version with the `=` prefix
- **AND** `engines.node` equals the registry's bound

#### Scenario: DSH dependency upgrade

- **WHEN** the targeted DSH version changes
- **THEN** the contributor reads the new DSH version's `engines.node` before editing `package.json`
- **AND** the registry's bound is updated in the same change
- **AND** `engines.node` follows the registry
- **AND** `engines.dsh` is updated to the new exact version
- **AND** the manifest passes the DSH compatibility check for that runtime

#### Scenario: Runtime mismatch is rejected

- **WHEN** the running DSH version differs from `engines.dsh`
- **THEN** DSH's install or startup check rejects the plugin unless the profile holds an exact-version exemption

### Requirement: OpenSpec CLI upgrades follow a documented procedure

The repository SHALL document one upgrade procedure for the `@fission-ai/openspec` pin and SHALL follow it for every upgrade. The procedure MUST state the target release's declared Node floor, the CLI coupling inventory, the files to edit, the test matrix, the release step and the rollback step. The guide SHALL describe that procedure and the current pin only; it SHALL NOT record a completed upgrade's version-to-version changes, measurements or outcomes.

#### Scenario: An upgrade starts with the target release facts

- **WHEN** a maintainer decides to upgrade the pinned CLI
- **THEN** the maintainer records the target version's release notes and CHANGELOG entries
- **AND** records its declared `engines.node` and the `schemaVersion` reported by `version --json`

#### Scenario: The edit sequence follows the guide

- **WHEN** the upgrade proceeds past the decision
- **THEN** the dependency, lockfile, version assertions, skill metadata and README are updated in the order the guide states
- **AND** each edit names the file that carries the old version

#### Scenario: An upgrade is verified and can be rolled back

- **WHEN** the upgrade edits are complete or rejected
- **THEN** the contract check, `npm test`, `npm run coverage:check` and `openspec validate` pass before release
- **AND** a rejected upgrade restores the previous pin and documentation and reruns the same checks

#### Scenario: The guide carries no upgrade record

- **WHEN** a maintainer finishes an upgrade and updates the guide
- **THEN** the guide's content remains the procedure and the current pin
- **AND** no section records that upgrade's version-to-version changes, measurements or outcomes
- **AND** the upgrade's evidence lives in the change artifacts and commit history

### Requirement: The CLI contract check fails on projection-breaking differences

The repository SHALL provide a development-only contract check that compares the JSON shape of the pinned CLI with a candidate CLI over one fixed fixture project and SHALL fail when a field the plugin reads is missing or has a changed type.

#### Scenario: A compatible candidate passes

- **WHEN** the candidate CLI returns every consumed field with the same type and only adds fields
- **THEN** the check exits zero and lists the added paths

#### Scenario: A projection-breaking candidate fails

- **WHEN** the candidate CLI omits a consumed field or changes its type
- **THEN** the check exits non-zero and names the command and the JSON path

#### Scenario: The candidate is checked without network access

- **WHEN** the check is given a local candidate binary
- **THEN** it runs both CLIs without contacting the npm registry

#### Scenario: A fixture command fails

- **WHEN** either CLI fails a fixture command
- **THEN** the check reports the command, exit code and stderr
- **AND** exits non-zero

### Requirement: Strict artifact validation gate

The pre-push hook SHALL validate every active change and main spec with warnings treated as failures, and SHALL check archived changes for completed tasks, before the coverage gate runs. A failure in either validation step SHALL block the push.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the coverage gate

#### Scenario: A warning exists

- **WHEN** a main spec or an active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** the strict validation still runs before the hook exits

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

### Requirement: Repository content and history exclude host paths

The repository SHALL NOT track, publish, or retain in reachable history any host-specific absolute path, including a home directory, user name, private harness profile, or workspace toolchain path.

#### Scenario: A tracked file still has a host path

- **WHEN** a tracked file contains `/home/<user>/`, `/Users/<user>/`, or `/root/`
- **THEN** the redaction is incomplete and the change is not ready to archive

#### Scenario: Reachable history is audited

- **WHEN** every reachable commit is scanned, including decompressed binary fixtures
- **THEN** no commit contains a host-specific absolute path

#### Scenario: History is rewritten

- **WHEN** reachable history is rewritten to remove host paths
- **THEN** each rewritten commit keeps its author, committer, dates and message

### Requirement: DSH runtime upgrades follow a documented procedure

The repository SHALL document one procedure for moving `engines.dsh` to a new exact DSH runtime and SHALL follow it for every upgrade. The procedure MUST state the compatibility gate, the target version's declared Node floor, the DSH coupling inventory, the ordered edits, the candidate verification, the test matrix, release and rollback.

#### Scenario: An upgrade starts with the target runtime facts

- **WHEN** a maintainer selects a target DSH version
- **THEN** the maintainer records its release notes and compare link
- **AND** confirms the exact version is published on the npm registry
- **AND** records its declared `engines.node` and the Node major its tests require

#### Scenario: Manifest and runtime baseline move together

- **WHEN** the target DSH version declares a different Node floor or major
- **THEN** `engines.dsh` names the target exact version with the `=` prefix
- **AND** `engines.node` equals the declared floor
- **AND** the primary Node major, `coverage.config.json` and the `project-invariants` baseline change in the same change

#### Scenario: The candidate runtime is verified before release

- **WHEN** the manifest names the target runtime
- **THEN** an isolated install of that runtime composes the plugin bundle without a skipped-bundle diagnostic
- **AND** a live boot of that runtime registers the plugin's tools, skills and policy
- **AND** the plugin test suite and coverage gate pass

#### Scenario: A rejected upgrade is rolled back

- **WHEN** the candidate runtime fails a check or a live smoke
- **THEN** the manifest, documentation and installed runtime return to the previous exact version
- **AND** the same checks pass on the restored version

#### Scenario: A version exemption does not replace verification

- **WHEN** a maintainer considers a profile version exemption for the plugin
- **THEN** the exemption is treated as a local diagnostic only
- **AND** the repository does not ship or record it as evidence of compatibility

#### Scenario: The guide carries no upgrade record

- **WHEN** a maintainer finishes an upgrade and updates the guide
- **THEN** the guide's content remains the procedure and the current pin
- **AND** no section records that upgrade's version-to-version changes, measurements or outcomes
- **AND** the upgrade's evidence lives in the change artifacts and commit history

### Requirement: Repository changes pass the review gates

The repository SHALL run draft review after the planning artifacts are complete and before implementation, and apply review after the implementation is committed and before archive. It SHALL not archive a change whose apply review is not ready.

#### Scenario: A change starts implementation

- **WHEN** a contributor starts apply
- **THEN** the draft review is ready or the apply tool refuses

#### Scenario: A change is archived

- **WHEN** a contributor archives a change
- **THEN** the apply review is ready, or apply review is disabled or unavailable

#### Scenario: A review is not ready

- **WHEN** the draft or apply review reports a blocker
- **THEN** the change is not implemented or archived until the blocker is fixed or waived

### Requirement: Plain test runs reuse a Node compile cache

The repository's plain test entrypoint SHALL set `NODE_COMPILE_CACHE` to the absolute `.cache/node-compile` directory under the repository root for the test process and every CLI child process it starts. The cache directory SHALL be ignored by version control. The coverage entrypoint SHALL remove an inherited `NODE_COMPILE_CACHE` and SHALL NOT set one, because Node documents that deserialised bytecode can make V8 coverage less precise. Reusing the cache SHALL NOT change a test outcome.

#### Scenario: A repeat test run reuses compiled bytecode

- **WHEN** the plugin test suite runs a second time on the same checkout
- **THEN** its CLI child processes reuse the compile cache
- **AND** the suite reports the same pass and fail counts as the first run

#### Scenario: The cache directory stays untracked

- **WHEN** a test run creates `.cache/node-compile`
- **THEN** the repository's ignored-file rules keep it out of `git status`
- **AND** the fixture cleanup asserts that no recorded fixture root contains a `.cache` entry before it removes the root

#### Scenario: Coverage does not reuse the cache

- **WHEN** the coverage entrypoint runs the suite
- **THEN** the test process does not carry `NODE_COMPILE_CACHE`, even when the caller exported it
- **AND** the coverage gate reports its usual percentages

### Requirement: Review tests are split across focused files

The repository SHALL keep the review test cases split across focused `test/*.test.mjs` files that run in parallel. Shared review fixtures SHALL live in `test/review-fixtures.mjs` and SHALL NOT be copied into a test file.

#### Scenario: A review test is added

- **WHEN** a contributor adds a review test
- **THEN** the test belongs to the file for its topic
- **AND** it imports the shared review fixtures instead of copying them

#### Scenario: The suite still covers every review case

- **WHEN** the review tests are split across files
- **THEN** the suite contains the same review cases as before the split
- **AND** each case still runs against the real bundled CLI
