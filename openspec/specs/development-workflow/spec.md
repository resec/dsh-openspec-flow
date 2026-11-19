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

The repository SHALL use the `openspec-apply-change` skill and the `openspec_apply_next` / `openspec_mark_task_done` tools for maintainer-authored and plugin-driven apply. An external contribution whose implementation arrives with its change in one pull request SHALL record task completion in `tasks.md`, by hand or with the plugin, before merge.

#### Scenario: A task is completed

- **WHEN** a maintainer or plugin-driven apply completes a task
- **THEN** the task is marked with `openspec_mark_task_done` and the returned `next` is used without re-running `openspec_apply_next`

#### Scenario: An external contribution records completion

- **WHEN** an external contributor implements a task before opening the pull request
- **THEN** `tasks.md` records the completion, by hand or with the plugin
- **AND** the maintainer does not require `openspec_apply_next` for that pull request

### Requirement: Verification gates a change

The repository SHALL require strict OpenSpec validation and one verification command before a change is considered complete. That command SHALL run the plugin test suite and the coverage gate in a single instrumented run, so a separate plain test pass is never required. Strict validation SHALL treat every warning as a failure.

#### Scenario: A change is finished

- **WHEN** every task is checked
- **THEN** `openspec_validate` passes with `strict: true`
- **AND** `npm run verify` passes on Node 24
- **AND** its output carries both the test summary and the coverage verdict

#### Scenario: The instrumented run fails a test

- **WHEN** a test fails during the verification run
- **THEN** `npm run verify` exits nonzero before the coverage gate is evaluated

#### Scenario: A validation warning is present

- **WHEN** the change or a main spec reports a warning
- **THEN** strict validation fails and the change is not complete

### Requirement: Repository publishing

The repository SHALL publish `main` to the `origin` remote at `git@github.com:resec/dsh-openspec-flow.git` and SHALL keep `main` tracking `origin/main`.

#### Scenario: Publishing main

- **WHEN** a maintainer publishes the repository
- **THEN** `git remote get-url origin` prints `git@github.com:resec/dsh-openspec-flow.git` and `git rev-parse --abbrev-ref main@{upstream}` prints `origin/main`

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
- **THEN** the contract check, `npm run verify` and `openspec validate` pass before release
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

The pre-push hook SHALL validate every active change and main spec with warnings treated as failures, and SHALL check archived changes for completed tasks, before the reusable lab scenarios run. It SHALL then run `npm run test:lab -- --mock-only` before `npm run verify`; a lab failure SHALL block the push and SHALL NOT be skipped by `COVERAGE_SKIP=1`. A failure in either validation step or the lab gate SHALL block the push.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the lab gate

#### Scenario: A warning exists

- **WHEN** a main spec or an active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation and the lab gate still run before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation and the lab gate have already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

#### Scenario: Lab scenarios pass before verification

- **WHEN** strict validation passes and `npm run test:lab -- --mock-only` passes
- **THEN** the hook continues to the coverage step

#### Scenario: A lab scenario fails

- **WHEN** a reusable lab scenario fails
- **THEN** the hook exits nonzero before `npm run verify`
- **AND** the push is blocked

#### Scenario: Coverage is skipped but the lab gate runs

- **WHEN** `COVERAGE_SKIP=1` is set and a lab scenario fails
- **THEN** the hook still runs the lab gate
- **AND** the push is blocked

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

The repository SHALL keep the review test cases split across focused `test/*.test.mjs` files that run in parallel. Shared review fixtures SHALL live in `test/review-fixtures.mjs` and SHALL NOT be copied into a test file. Review suites SHALL exercise the real bundled CLI in-process by default through the fake Host context, and the real child-process path SHALL stay covered by a dedicated contract test.

#### Scenario: A review test is added

- **WHEN** a contributor adds a review test
- **THEN** the test belongs to the file for its topic
- **AND** it imports the shared review fixtures instead of copying them

#### Scenario: The suite still covers every review case

- **WHEN** the review tests are split across files
- **THEN** the suite contains the same review cases as before the split
- **AND** each case still exercises the real bundled CLI, in-process by default, with the contract test covering a real child process

### Requirement: Apply verifies touched tests between task batches

The repository SHALL provide a development-only selector returning the test files importing a changed module, directly or through a helper, without expanding the entry modules. A changed test file SHALL select itself; a changed entry module, a path outside the source and test trees, or any other path with no importing test SHALL select the full suite. Apply SHALL run the selection after each task batch and the full suite once before completion.

#### Scenario: A changed module selects its importing tests

- **WHEN** a task batch changes `lib/review/brief.js`
- **THEN** the selector lists `test/review-unit.test.mjs` and `test/review-reviewer.test.mjs`
- **AND** it does not list `test/review-apply.test.mjs`, which reaches the module only through the plugin entry

#### Scenario: A changed entry module selects the full suite

- **WHEN** a task batch changes `index.js`, `client.js`, `reviewer.js` or `lib/tools/index.js`
- **THEN** the selector lists every test file

#### Scenario: A path with no importing test selects the full suite

- **WHEN** the changed path has no importing test file, directly or through a helper, and is not a test file
- **THEN** the selector lists every test file

#### Scenario: A changed test file runs itself

- **WHEN** the changed path is a test file
- **THEN** the selector lists that test file

#### Scenario: An empty change set is reported, not expanded

- **WHEN** the selector runs without paths and the working tree is clean
- **THEN** it exits nonzero and says that no changed path was found

#### Scenario: The completion gate stays the full suite and the coverage gate

- **WHEN** every task is checked
- **THEN** `npm run verify` still decides completion, and a scoped run does not stand in for it

### Requirement: The scoped test entrypoint follows the plain-run test contract

The scoped test entrypoint SHALL run the node-version preflight before any test starts and SHALL reuse the compile-cache policy the repository's plain test entrypoint defines, so both entrypoints share one environment instead of duplicating the rule. A runtime the preflight rejects SHALL stop the run before a test executes. Listing a selection SHALL start no test process. A failing selected file SHALL surface its exit status.

#### Scenario: A scoped run follows the plain-run environment

- **WHEN** the scoped entrypoint runs a selected set
- **THEN** it applies the same compile-cache policy as the plain test entrypoint
- **AND** the run reports the same pass and fail counts as a plain run of those files

#### Scenario: A non-primary runtime stops before testing

- **WHEN** the selector runs on a runtime the preflight rejects
- **THEN** it reports the runtime and exits nonzero before any test starts

#### Scenario: A failing selected test yields a non-zero status

- **WHEN** one selected test file fails
- **THEN** the selector exits nonzero with that status

#### Scenario: Listing does not run tests

- **WHEN** the selector is given the list option and the run option together
- **THEN** it prints the selected files
- **AND** it starts no test process

### Requirement: Coverage stamp verification

After strict validation and the lab gate, the pre-push hook SHALL skip only the `npm run verify` rerun when the coverage stamp verifies as `coverage-gate` defines it. Except for `COVERAGE_SKIP=1`, any other stamp outcome SHALL run verification.

#### Scenario: A verifying stamp skips only the verification rerun

- **WHEN** strict validation and the lab gate pass and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation and the lab gate have already run

#### Scenario: A non-verifying stamp runs verification

- **WHEN** strict validation and the lab gate pass and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

### Requirement: Review fixture data is tracked

The repository SHALL keep the probe project copied by the review fixtures in tracked files under `test/fixtures/`. `test/review-fixtures.mjs` SHALL be the single source of the probe path, and test files SHALL import that path instead of recomputing it. Every review suite SHALL resolve the project inside the repository, so a clean checkout runs without repository-external files or a local setup step.

#### Scenario: A clean checkout runs the review suite

- **WHEN** the review suite runs on a fresh checkout
- **THEN** its probe project is present under `test/fixtures/probe/openspec`
- **AND** no fixture path resolves outside the repository

#### Scenario: A test recomputes the probe path

- **WHEN** a top-level test module defines its own probe path instead of importing the shared one
- **THEN** the repository layout test fails and names the module

#### Scenario: A fixture path leaves the repository

- **WHEN** the shared probe path resolves outside the repository root
- **THEN** the repository layout test fails and names the fixture path

### Requirement: Test fixtures use canonical temporary paths

The plain, scoped and coverage test entrypoints SHALL pass the child test process a `TMPDIR` equal to the canonical path of the host temporary directory. A fixture root SHALL equal the path a child process reports for the same directory. When the canonical path cannot be resolved, the entrypoint SHALL keep the inherited value. The normalization SHALL NOT change an outcome on a host whose temporary directory is already canonical.

#### Scenario: The temporary directory is a symlink

- **WHEN** a test creates a fixture under a temporary directory reached through a symlink
- **THEN** the fixture root and the path a child process reports for that directory compare equal
- **AND** the suite passes

#### Scenario: The temporary directory is already canonical

- **WHEN** the host temporary directory has no symlink component
- **THEN** the test result is unchanged

#### Scenario: The canonical path cannot be resolved

- **WHEN** resolving the temporary directory fails
- **THEN** the entrypoint keeps the inherited value
- **AND** the run continues

### Requirement: Agent instructions scope the push path to the maintainer

`AGENTS.md` SHALL state that the post-archive push to `origin/main` is the maintainer's step and that an external contribution stops at its pull request. The archive step SHALL NOT read as an instruction for an external contributor to push.

#### Scenario: An external contributor reads the workflow

- **WHEN** an external contributor follows `AGENTS.md`
- **THEN** the push step names the maintainer as its owner
- **AND** the contributor follows `CONTRIBUTING.md` and stops at the pull request

#### Scenario: The maintainer archives a change

- **WHEN** the maintainer archives a change
- **THEN** the maintainer commits the archive and pushes `origin/main`

### Requirement: Review suites run the bundled CLI in-process by default

The review test suites SHALL execute the pinned bundled CLI through an in-process runner by default: calls are serialized, console output is captured, and the per-call working directory and environment are restored afterwards. The real child-process path SHALL remain selectable through an explicit spawn mode.

#### Scenario: A review suite runs by default

- **WHEN** a review suite runs without an explicit spawn mode
- **THEN** its CLI calls do not start a child process
- **AND** the suite reports the same cases and outcomes as the child-process mode

#### Scenario: The real child-process path stays covered

- **WHEN** the contract suite runs
- **THEN** it invokes the bundled CLI in a real child process
- **AND** it asserts the exit code, abort and output bounds

#### Scenario: Concurrent calls are serialized

- **WHEN** two CLI calls are issued at the same time
- **THEN** they run one after another
- **AND** their captured outputs do not interleave

### Requirement: In-process CLI calls preserve exit codes

An in-process CLI call SHALL report an exit code from either an explicit `process.exit` call or a `process.exitCode` assignment that returns, and SHALL restore the test process exit code afterwards.

#### Scenario: A failed CLI call keeps its exit code

- **WHEN** the in-process CLI assigns `process.exitCode` and returns without exiting
- **THEN** the tool observes that exit code
- **AND** the test process exit code is restored to its value before the call

### Requirement: Test entrypoints use a bounded test-file concurrency

The plain test entrypoint SHALL run test files with a concurrency of 8 by default and SHALL accept an explicit override through its argument passthrough. The coverage entrypoint and the affected-test selector SHALL pass the same default to the test run they start, so all three entrypoints use one concurrency policy.

#### Scenario: A plain run uses the default concurrency

- **WHEN** `npm test` starts
- **THEN** the test runner is given a test-file concurrency of 8

#### Scenario: An override is honored

- **WHEN** the caller passes `--test-concurrency=<n>` after `--`
- **THEN** the test runner uses that value instead of the default

#### Scenario: Coverage and affected runs share the default

- **WHEN** `npm run verify` or `npm run test:affected` starts tests
- **THEN** the test runner is given the same concurrency of 8

### Requirement: The repository root ignores the review root

The repository root `.gitignore` SHALL keep ignoring the legacy review root `openspec/.review/`, so a worktree that lacks the nested ignore file still keeps legacy records out of `git status`. The shared review root lives under the git common directory, outside every worktree, so it needs no worktree ignore entry. The tracked `openspec/.gitignore` SHALL remain the project-level legacy rule.

#### Scenario: The root rule is present

- **WHEN** a reader reads the repository root `.gitignore`
- **THEN** it contains an `openspec/.review/` entry

#### Scenario: A worktree without the nested file stays clean

- **WHEN** a git worktree has the root rule but no nested file, for example a branch that removed it or a sparse checkout, and a legacy review record is written under `openspec/.review/`
- **THEN** `git status --porcelain` reports no review path

#### Scenario: The nested rule remains

- **WHEN** the repository tracks `openspec/.gitignore`
- **THEN** that file still contains the `.review/` entry

#### Scenario: The shared root is outside the worktree

- **WHEN** a review record is written under `<git common dir>/openspec-flow/review/`
- **THEN** it is not a worktree path and needs no `.gitignore` entry
