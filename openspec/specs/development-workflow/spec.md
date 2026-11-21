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

### Requirement: Land sequences the land and archive commits

A maintainer worktree apply SHALL land as a fast-forward commit that carries the implementation and its documentation, followed by an archive commit that carries the archive and merged specs; both SHALL precede the push to `origin/main`. Land SHALL NOT create a merge commit.

#### Scenario: A worktree change is landed

- **WHEN** `openspec_apply_worktree action=land` completes
- **THEN** the land commit carries the implementation and its documentation
- **AND** the archive commit carries the archive and merged specs
- **AND** the two commits form a linear history
- **AND** both are pushed together after the archive commit

### Requirement: Landed main push requires a verified manifest

The repository SHALL provide `scripts/push-landed.mjs`. It SHALL select a manifest under `<git common dir>/openspec-flow/landed/` by latest `landedAt`, `--change`, `--merge` or `--manifest`, refuse a missing or incomplete manifest, default to a dry run, and push only with `--push`. It SHALL exit 0 on success or an already-pushed remote, 1 on a refused check or remote failure, and 2 on usage errors.

#### Scenario: Default run does not push

- **WHEN** the maintainer runs the script without `--push`
- **THEN** the script prints the selected manifest and the commit range and the remote is unchanged

#### Scenario: Missing manifest

- **WHEN** the landed directory has no manifest and no explicit manifest is passed
- **THEN** the script fails and names the directory it inspected

#### Scenario: Explicit selection

- **WHEN** `--change`, `--merge` or `--manifest` names exactly one landed record
- **THEN** the script uses that record and refuses an ambiguous or unmatched selection

### Requirement: Landed push validates manifest facts

Before any push, the script SHALL require `approvedBy: "user"`, the current branch `main`, and a worktree clean apart from uncommitted paths under `openspec/changes/` directories other than the landed change's own directory. It SHALL require the resolved land commit and `archiveCommit` to be commits reachable from `HEAD`.

#### Scenario: Dirty file outside the change tree

- **WHEN** the main worktree has an uncommitted file outside `openspec/changes/`
- **THEN** the script fails before contacting the remote and names the changed paths

#### Scenario: Another change's planning file is uncommitted

- **WHEN** the only uncommitted paths are under another change's `openspec/changes/<name>/` directory
- **THEN** the script continues with the landed push checks

#### Scenario: The landed change's own directory is uncommitted

- **WHEN** the only uncommitted path is under the landed change's own `openspec/changes/<change>/` directory
- **THEN** the script fails and names that path

#### Scenario: Wrong branch

- **WHEN** the main worktree is not on `main`
- **THEN** the script fails and names the current branch

#### Scenario: Approval is not the user

- **WHEN** the manifest does not record `approvedBy: "user"`
- **THEN** the script fails and names the manifest

#### Scenario: Manifest commit is missing

- **WHEN** the land commit or `archiveCommit` is not a commit in the local repository
- **THEN** the script fails and names the missing value

### Requirement: Landed push verifies the land and archive commits

The script SHALL require `HEAD` to equal `archiveCommit`, the commit tree of the resolved land commit to equal `featureTree`, and the diff from the land commit to `archiveCommit` to touch only the archived change, its former directory and `openspec/specs/`. A commit after the selected archive, a tree mismatch, or an unexpected path SHALL be refused.

#### Scenario: Merge tree does not match the review

- **WHEN** the tree of the land commit differs from the manifest `featureTree`
- **THEN** the script fails and names both values

#### Scenario: Archive commit touches implementation

- **WHEN** the diff from the land commit to `archiveCommit` contains a path outside the archived change, its former directory and `openspec/specs/`
- **THEN** the script fails and lists the unexpected paths

#### Scenario: Main is ahead of the landed archive

- **WHEN** `HEAD` contains commits after the selected `archiveCommit`
- **THEN** the script fails and asks for the latest landed manifest instead of pushing an unverified range

### Requirement: Landed push reconciles the remote and is idempotent

The script SHALL use the repository's `origin` remote. Before deciding, it SHALL fetch `origin`'s main; a dry run SHALL perform the fetch too. It SHALL report success without pushing when the remote main equals `HEAD`, push only when the remote main is an ancestor of `HEAD`, and refuse a remote main ahead of `HEAD`, a diverged history or a missing remote main. A push SHALL invoke the pre-push hook and SHALL NOT pass `--no-verify` or push any ref other than `main`.

#### Scenario: Remote already contains the landed commit

- **WHEN** the fetched remote main equals `HEAD`
- **THEN** the script reports that nothing needs pushing and exits successfully without a push

#### Scenario: Remote is behind

- **WHEN** the fetched remote main is an ancestor of `HEAD`
- **THEN** an explicit `--push` pushes `HEAD` to the remote main

#### Scenario: Remote is ahead

- **WHEN** the fetched remote main contains commits not in `HEAD`
- **THEN** the script fails and asks for local reconciliation instead of force-pushing

#### Scenario: Histories diverged

- **WHEN** neither side is an ancestor of the other
- **THEN** the script fails and does not push

#### Scenario: Remote main is missing

- **WHEN** `origin` has no main branch
- **THEN** the script fails and names the missing remote ref

#### Scenario: Dry run fetches but does not push

- **WHEN** the script runs without `--push`
- **THEN** it fetches `origin` main to report the remote state and performs no push

#### Scenario: Pre-push gate runs

- **WHEN** `--push` executes
- **THEN** the repository's pre-push hook runs and the script does not bypass it

### Requirement: Landed push is documented

The repository SHALL document the command, dry-run default, exit codes, checked fields, the `npm run hooks:install` prerequisite for the pre-push gate, and recovery for a dirty tree, wrong branch, missing manifest, mismatched tree, missing remote main and diverged remote in `docs/land-push.md`. `AGENTS.md`, `README.md`, `docs/apply-worktree.md` and `docs/apply-worktree-dev.md` SHALL link that document.

#### Scenario: Documentation is reachable

- **WHEN** a maintainer opens the documented push section from any of the four entry points
- **THEN** the link resolves to `docs/land-push.md`

#### Scenario: Hook prerequisite is documented

- **WHEN** a maintainer reads `docs/land-push.md`
- **THEN** it names `npm run hooks:install` as the prerequisite for the pre-push gate

#### Scenario: Recovery is named

- **WHEN** a validation or remote check fails
- **THEN** the document names the condition and the command or correction that resolves it

### Requirement: Landed push selects a land commit

`scripts/push-landed.mjs` SHALL accept `--land` to select a manifest by the resolved land commit prefix and SHALL keep `--merge` as a legacy alias. It SHALL resolve the landed commit from `landCommit`, falling back to legacy `mergeCommit`, and SHALL refuse a manifest whose two fields name different commits.

#### Scenario: --land selects a fast-forward manifest

- **WHEN** `--land` names one fast-forward manifest prefix
- **THEN** the script selects that manifest and reports the resolved land commit

#### Scenario: --merge stays a legacy alias

- **WHEN** an existing command passes `--merge` for a fast-forward or legacy manifest
- **THEN** the script selects by the same resolved land commit

#### Scenario: Two manifest fields disagree

- **WHEN** a manifest carries `landCommit` and `mergeCommit` with different commits
- **THEN** the script refuses the manifest instead of choosing one

### Requirement: Landed push documents the land fields

`docs/land-push.md` SHALL document the `--land` selector, the legacy `--merge` alias, the `landCommit` field, the legacy `mergeCommit` fallback and the fast-forward land sequence.

#### Scenario: The land fields are documented

- **WHEN** a maintainer reads the checks and recovery sections
- **THEN** the document names `--land`, `--merge`, `landCommit`, the legacy fallback and fast-forward

### Requirement: Apply review commits address one finding

Every commit made during apply review SHALL address at most one finding: it carries that finding's fix, or the rework a later review demands, with the regression test when behavior changes, and no other finding's changes. A finding MAY take more than one commit. A finding that changes no committed file SHALL leave no commit. The findings of a round SHALL be committed before the next round opens.

#### Scenario: A round reports several findings

- **WHEN** an apply review round reports several findings that change committed files
- **THEN** each commit addresses one finding
- **AND** no commit carries another finding's changes

#### Scenario: A later review overturns a fix

- **WHEN** a later review overturns the fix committed for one finding
- **THEN** the rework lands as a further commit for that same finding
- **AND** neither commit carries another finding's changes

#### Scenario: A finding's fix changes only documentation

- **WHEN** a fixed finding changes only documentation or a planning artifact
- **THEN** the fix lands as that finding's own commit
- **AND** it follows the same one-finding-per-commit rule

#### Scenario: A finding changes no committed file

- **WHEN** a finding is disposed as deferred, rejected or waived
- **THEN** no commit is made for it
- **AND** the disposition stays in the review record rather than in git

#### Scenario: A round's findings are ready for the next round

- **WHEN** every handled finding of a round is committed
- **THEN** the next round opens on those commits
- **AND** the log read before resuming shows each commit answering one finding

### Requirement: Git carries no review-local identifiers

The repository SHALL keep review round numbers, extra-round tokens, finding ids, review record paths and card files out of committed content. Where that content must carry a finding's substance, it SHALL restate the defect and the fix. Text that defines or implements these formats MAY name them. A commit written before this convention SHALL NOT gain these identifiers, and a history rewrite another requirement in this capability requires SHALL stay allowed.

#### Scenario: A commit answers a finding

- **WHEN** a maintainer commits a fix for an apply review finding
- **THEN** the message states the defect, the fix and the reason
- **AND** it names no round number, extra-round token, finding id, record path or card file

#### Scenario: A change README reports a review conclusion

- **WHEN** a change README describes the work done for a review finding
- **THEN** it restates the defect and the fix
- **AND** it names no round number, extra-round token, finding id, record path or card file

#### Scenario: The history needs a finding's content

- **WHEN** a commit message must carry what the finding said
- **THEN** it restates the defect and the fix in its own words
- **AND** a reader without the review record can follow it

#### Scenario: Contract text names the formats

- **WHEN** a specification, `docs/review.md`, the plugin source, its tests, the README, `AGENTS.md` or a change about review rounds defines or implements these formats
- **THEN** naming `R<round>-NN`, `E<n>` or a record path there is allowed
- **AND** that text is not a citation of the review that produced a change

#### Scenario: A change implements review rounds

- **WHEN** a feature commit adds or changes review rounds
- **THEN** its message may name rounds as the feature's subject
- **AND** it cites no finding from a review of that work

#### Scenario: History predates the convention

- **WHEN** a commit was written before this convention
- **THEN** it is not retrofitted with these identifiers
- **AND** it is otherwise left as it is

#### Scenario: Another requirement requires a history rewrite

- **WHEN** a host path must be removed from reachable history
- **THEN** the rewrite follows `Repository content and history exclude host paths`
- **AND** this requirement does not block it
