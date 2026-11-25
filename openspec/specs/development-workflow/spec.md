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

The repository SHALL archive a change before the archive commit is pushed to `origin/main`, so the archive commit carries the merged specs. A maintainer-authored change SHALL be archived before its implementation is pushed directly to `main`. An external contribution MAY merge its active change through a pull request; the maintainer SHALL archive it after merge, and the archive commit SHALL follow the apply review.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a maintainer-authored change's tasks are incomplete or `openspec_validate` fails
- **THEN** no archive commit is created and no implementation from that change is pushed directly to `main`

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

A main-only push SHALL validate main specs and archived tasks with warnings as failures, and SHALL proceed only when every active change reports `in-progress`. Any other push SHALL validate every active change, main spec, and archived tasks the same way. Validation SHALL precede `npm run verify`; a validation failure SHALL block the push. The local hook SHALL NOT run the lab scenarios; the remote `lab` CI job SHALL guard pull requests and `main`.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the coverage step

#### Scenario: A main-only push ignores an in-progress change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `in-progress`
- **THEN** the hook validates main specs and archived tasks
- **AND** the hook does not validate that active change
- **AND** the hook continues to the coverage step

#### Scenario: A main-only push blocks a complete change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `complete`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change to archive or land

#### Scenario: A main-only push blocks a task-less change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `no-tasks`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the task-less change

#### Scenario: A main-only push blocks an unknown status

- **WHEN** a push targets only `refs/heads/main` and an active change reports a status other than `in-progress`, `complete` or `no-tasks`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change and the unrecognized status

#### Scenario: A non-main push validates a complete change

- **WHEN** a push targets a ref other than `refs/heads/main` and its complete active change passes strict validation
- **THEN** the hook runs the full validation
- **AND** it continues to the coverage step

#### Scenario: A mixed push validates every active change

- **WHEN** a push targets `refs/heads/main` and another ref
- **THEN** the hook runs the full validation over every active change

#### Scenario: A warning exists

- **WHEN** a main spec reports a warning, or a non-main push's active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: The active-change listing is unreadable

- **WHEN** the main-only gate cannot read the active-change status
- **THEN** the hook exits nonzero before the coverage step

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation still runs before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation passes and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation has already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation passes and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

#### Scenario: Lab scenarios pass before verification

- **WHEN** the remote `lab` job passes for the same pull request and strict validation also passes
- **THEN** the pull request satisfies both the local validation and the remote lab gate

#### Scenario: A lab scenario fails

- **WHEN** the remote `lab` job fails
- **THEN** the pull request is blocked by the required check
- **AND** the local hook still runs strict validation

#### Scenario: Coverage is skipped but the lab gate runs

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation still runs and the remote `lab` job remains the lab gate

#### Scenario: The hook does not run lab scenarios

- **WHEN** strict validation passes
- **THEN** the hook continues to the coverage step without running `npm run test:lab`

#### Scenario: Remote lab guards pull requests and main

- **WHEN** a pull request or a push to `main` starts remote CI
- **THEN** the `lab` job runs the reusable DSH scenarios

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

The repository SHALL run draft review before implementation for maintainer-authored changes, and before merge for an external contribution whose change artifacts and implementation arrive in one pull request. It SHALL run apply review after implementation is committed and before archive, and SHALL not archive a change whose final apply review is not ready. For an external contribution under the PR review watch, it SHALL also run an apply review on the PR head or rebased branch before merge.

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
- **AND** runs the apply review on the pull request head or rebased branch before merge when the PR review watch is enabled
- **AND** runs the apply review before archive

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed tree
- **THEN** archive is refused
- **AND** the maintainer runs another apply review before archive

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

After strict validation, the pre-push hook SHALL skip only the `npm run verify` rerun when the coverage stamp verifies as `coverage-gate` defines it. Except for `COVERAGE_SKIP=1`, any other stamp outcome SHALL run verification.

#### Scenario: A verifying stamp skips only the verification rerun

- **WHEN** strict validation passes and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation has already run

#### Scenario: A non-verifying stamp runs verification

- **WHEN** strict validation passes and the coverage stamp does not verify
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

The plain, scoped and coverage test entrypoints SHALL pass the child test process a `TMPDIR` that is a per-run root under the canonical path of the host temporary directory. A fixture root SHALL equal the path a child process reports for the same directory. When the canonical path cannot be resolved, the entrypoint SHALL keep the inherited value and SHALL run without a run root. The normalization SHALL NOT change an outcome on a host whose temporary directory is already canonical.

#### Scenario: The temporary directory is a symlink

- **WHEN** a test creates a fixture under a temporary directory reached through a symlink
- **THEN** the fixture root and the path a child process reports for that directory compare equal
- **AND** the suite passes

#### Scenario: The temporary directory is already canonical

- **WHEN** the host temporary directory has no symlink component
- **THEN** the test result is unchanged

#### Scenario: The canonical path cannot be resolved

- **WHEN** resolving the temporary directory fails
- **THEN** the entrypoint passes the inherited value to the test process and runs without a run root
- **AND** the run continues

### Requirement: Agent instructions scope the push path to the maintainer

`AGENTS.md` SHALL state the online pull-request completion path, the offline land path, the retarget step, and that the post-archive push to `origin/main` is the maintainer's step. An external contribution stops at its pull request. The archive step SHALL NOT read as an instruction for an external contributor to push.

#### Scenario: An external contributor reads the workflow

- **WHEN** an external contributor follows `AGENTS.md`
- **THEN** the push step names the maintainer as its owner
- **AND** the contributor follows `CONTRIBUTING.md` and stops at the pull request

#### Scenario: The maintainer archives a change

- **WHEN** the maintainer archives a change
- **THEN** the maintainer commits the archive and pushes `origin/main`

#### Scenario: The maintainer completes a change online

- **WHEN** the maintainer follows the online path
- **THEN** `AGENTS.md` names the pull request, retarget, land and archive push as the maintainer's steps

#### Scenario: The maintainer completes a change offline

- **WHEN** the maintainer follows the offline path
- **THEN** `AGENTS.md` names the local lab, land, archive and deferred push

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

A maintainer worktree apply SHALL land as a fast-forward commit that carries the implementation and its documentation, followed by an archive commit that carries the archive and merged specs. In the online path the land commit is the pull-request merge commit, already on `origin/main`; in the offline path it is the reviewed local head. Both SHALL precede the archive push. Land SHALL NOT create a merge commit.

#### Scenario: A worktree change is landed

- **WHEN** `openspec_apply_worktree action=land` completes for an offline change
- **THEN** the land commit carries the implementation and its documentation
- **AND** the archive commit carries the archive and merged specs
- **AND** the two commits form a linear history
- **AND** both are pushed together after the archive commit

#### Scenario: An online worktree change is landed

- **WHEN** the reviewed worktree is retargeted to the pull-request merge commit and landed
- **THEN** the land commit is the merge commit already on `origin/main`
- **AND** the archive commit follows it locally
- **AND** only the archive commit is pushed after land

#### Scenario: Land creates no merge commit

- **WHEN** a maintainer worktree change lands
- **THEN** land does not create a merge commit on `main`

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

- **WHEN** the fetched remote main is an ancestor of `HEAD` and every new commit passes the landed-range requirement
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

### Requirement: Labeled pull-request landing

The landing command SHALL merge a labeled external pull request with `gh pr merge --rebase`, and the session SHALL archive on main only when the merged tree equals the reviewed tree. It SHALL NOT archive a change whose reviewed tree differs from the merged tree.

#### Scenario: A labeled pull request lands

- **WHEN** the `mergeable` label is present and the final review is ready
- **THEN** the landing command merges with `gh pr merge --rebase` and the session archives on main after the tree matches

#### Scenario: The merged tree differs

- **WHEN** the merged tree differs from the reviewed tree
- **THEN** the PR checkout and its apply state are removed first
- **AND** the maintainer runs another apply review on the merged tree before archive

### Requirement: In-process CLI calls await asynchronous command completion

The in-process CLI runner SHALL wait for the asynchronous command action to settle when the CLI module exposes an awaitable program entry, and SHALL end such a call early only through the configured deadline or the call's abort. A module without that entry SHALL keep the output-based polling path as a fallback. Exit-code reporting SHALL be preserved on both paths.

#### Scenario: A delayed asynchronous command completes

- **GIVEN** a CLI module whose awaitable entry logs, awaits a delay, then logs again
- **WHEN** the in-process runner executes the call
- **THEN** the call completes only after the second log
- **AND** the captured stdout contains both records

#### Scenario: The fallback remains available

- **GIVEN** a CLI module that exposes no awaitable program entry
- **WHEN** the in-process runner executes a call
- **THEN** the runner uses the output-based completion path
- **AND** the call reports the same exit code and captured output as before

#### Scenario: The pinned CLI takes the awaitable path

- **GIVEN** the pinned bundled CLI is loaded
- **WHEN** the runner selects its completion path
- **THEN** it finds an awaitable program entry
- **AND** it does not complete through the polling fallback

#### Scenario: A bounded deadline terminates a stalled call

- **GIVEN** an awaitable entry that never settles
- **WHEN** the configured deadline elapses
- **THEN** the call completes with exit code 124
- **AND** the per-call process state is restored

#### Scenario: An aborted call releases the queue

- **GIVEN** an awaitable entry that never settles
- **WHEN** the call's abort signal fires
- **THEN** the call rejects with the abort error
- **AND** the next queued call completes with its own output
- **AND** the per-call process state is restored

#### Scenario: Repeated calls share the awaitable entry

- **GIVEN** the runner has loaded the CLI module once
- **WHEN** two calls run in sequence through the same program instance
- **THEN** both calls complete with their own output
- **AND** neither call observes the other call's output

### Requirement: Online local completion via pull request

After apply review, a maintainer-authored change SHALL publish a pull request, wait for green CI, merge it with `gh pr merge --rebase`, retarget the reviewed worktree to the merge commit after verifying the merge tree equals the reviewed tree, and run `openspec_apply_worktree action=land`. Land SHALL archive, commit, write the manifest and remove the worktree and branch. The maintainer SHALL push the archive commit with `push-landed`. The implementation SHALL NOT be pushed directly to `main`.

#### Scenario: A maintainer change is published

- **WHEN** the apply review is passed and the publish gates pass
- **THEN** the reviewed branch is pushed and a draft pull request is opened and marked ready

#### Scenario: The local pull request is merged

- **WHEN** CI is green, the head contains `origin/main` and the reviewed tree matches
- **THEN** the owner merges the pull request with `gh pr merge --rebase`

#### Scenario: The reviewed worktree is retargeted

- **WHEN** the merge commit tree equals the reviewed tree
- **THEN** the owner resets the worktree branch to the merge commit and runs `openspec_apply_worktree action=land`

#### Scenario: The archive commit is pushed

- **WHEN** land has archived the change and written the manifest
- **THEN** `push-landed --push` publishes the archive commit

### Requirement: Maintainer restricted-path exemption

The pull-request change check SHALL exempt a maintainer-authored same-repository pull request from the restricted-path refusal. CI SHALL pass the exemption only when the pull-request author is `resec` and the head repository equals the base repository. The exemption SHALL skip only the restricted-path rule; the exactly-one-active-change, task-completion, head `package.json` and dependency/engine/package-manager checks SHALL run. Every other pull request SHALL still fail on a restricted path.

#### Scenario: A maintainer pull request changes a restricted path

- **WHEN** the pull-request author is `resec`, the head repository equals the base repository, and the change touches `.githooks/pre-push`
- **THEN** the change check skips the restricted-path refusal
- **AND** the other change-check rules still run

#### Scenario: An external pull request changes a restricted path

- **WHEN** the pull-request author is not `resec` or its head repository is a fork, and the change touches a restricted path
- **THEN** the change check refuses the restricted path

### Requirement: Offline local completion

When GitHub is unreachable, a maintainer-authored change SHALL NOT publish a pull request. After apply review and passing `npm run test:lab -- --mock-only`, it SHALL run `openspec_apply_worktree action=land` with user approval, archive and stop at local `main` without a push. When GitHub returns, `push-landed --push --offline` SHALL publish the deferred commits after the offline land is recorded. Local `main` leading `origin/main` SHALL block a new online pull request until that push completes.

#### Scenario: Offline land completes at local main

- **WHEN** GitHub is unreachable, the apply review is passed and the local lab passes
- **THEN** land archives the change and local `main` reaches the archive commit
- **AND** no push runs

#### Scenario: Deferred push

- **WHEN** GitHub is reachable and local `main` leads `origin/main`
- **THEN** `push-landed --push --offline` publishes the deferred land and archive commits after the offline land is recorded

#### Scenario: Local main leads origin/main

- **WHEN** a new online pull request is attempted while local `main` leads `origin/main`
- **THEN** the publish command refuses and names `push-landed`

### Requirement: Maintainer pull-request archive ordering

A maintainer pull request SHALL be archived after its implementation is merged and before the archive commit is pushed to `origin/main`. The owner SHALL retarget the reviewed worktree to the merge commit, land, and push the archive commit. An offline land SHALL archive before its deferred push. The implementation SHALL NOT be pushed directly before the archive.

#### Scenario: An online maintainer pull request is archived

- **WHEN** a maintainer pull request is merged and landed
- **THEN** the archive commit follows the merged implementation
- **AND** the owner pushes the archive commit after land

#### Scenario: An offline land defers the push

- **WHEN** GitHub is unreachable and a maintainer change is landed locally
- **THEN** the land and archive commits stay local
- **AND** `push-landed` publishes them after GitHub returns

### Requirement: Landed push requires a merged or recorded offline land

`push-landed` SHALL inspect every manifest whose resolved land commit or archive commit lies in the fetched `origin/main..HEAD` range before a dry run or a push. Each such land commit SHALL already be an ancestor of `origin/main`, unless the change has a recorded `landed-offline` phase or a matching offline-land record and the caller passes `--offline`. Plain reviewed commits in the range SHALL NOT be refused. The flag alone SHALL NOT authorize the push.

#### Scenario: A direct worktree land is refused

- **WHEN** a manifest's land commit is not on `origin/main` and the change has no `landed-offline` phase or offline-land record
- **THEN** both the dry run and `--push` fail and name the manifest and the unmerged land commit
- **AND** `origin/main` is unchanged

#### Scenario: An online merge is pushed

- **WHEN** the manifest's land commit is already on `origin/main` and the remaining range is the archive commit
- **THEN** the dry run reports the archive-only range
- **AND** `--push` publishes only the archive commit

#### Scenario: A recorded offline land is deferred

- **WHEN** the change has a matching offline-land record or a `landed-offline` local phase and the caller passes `--offline`
- **THEN** the dry run reports the deferred land and archive commits
- **AND** `--push` publishes them

#### Scenario: A multi-commit reviewed branch is deferred

- **WHEN** the offline range contains reviewed commits between `origin/main` and the recorded land commit and the record plus `--offline` match
- **THEN** the plain reviewed commits do not refuse the push
- **AND** the deferred land and archive commits are published

#### Scenario: The offline flag is missing

- **WHEN** an offline record or `landed-offline` phase exists but the caller omits `--offline`
- **THEN** the script refuses and names `--offline`

#### Scenario: The push range contains an earlier direct land

- **WHEN** the selected manifest is merged but the range also contains an earlier committed land that is not on `origin/main`
- **THEN** the script refuses before pushing

#### Scenario: A non-worktree commit does not block

- **WHEN** the range contains a plain commit from the documented non-worktree push and no manifest land commit is unmerged
- **THEN** the script does not refuse the range for that commit

### Requirement: Pre-push refuses an unmerged landed push

A push that includes `refs/heads/main` SHALL apply the landed-range rule after artifact validation and before the coverage step. A push whose range contains an unmerged land commit SHALL exit nonzero without running the coverage check. A range with no manifest-backed commit SHALL keep the existing non-worktree path. A recorded offline range SHALL pass only when `push-landed --offline` marked the push.

#### Scenario: A direct land is blocked by the hook

- **WHEN** a push includes `refs/heads/main` and the range contains a manifest land commit not on the remote main
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change and the remedy

#### Scenario: An online archive reaches the coverage step

- **WHEN** a push includes `refs/heads/main` and every manifest-backed commit is already merged
- **THEN** the hook continues to the coverage step

#### Scenario: A raw offline push is refused

- **WHEN** a push includes an offline-landed manifest without the marker set by `push-landed --offline`
- **THEN** the hook exits nonzero and names `push-landed --offline`

#### Scenario: The marked offline push passes

- **WHEN** `push-landed --offline` marks the push after verifying the offline record
- **THEN** the hook continues to the coverage step

#### Scenario: A non-worktree main push keeps its path

- **WHEN** the range has no manifest-backed commit
- **THEN** the hook continues with the existing validation and coverage behavior

### Requirement: Offline land record

An offline land with no local owner entry SHALL be recorded with `offline-land record`, keyed by the manifest's resolved land commit, after verifying the manifest, main `HEAD`, archive commit, reviewed tree and user approval. `push-landed --offline` SHALL accept that record or an existing `landed-offline` phase; a bare `--offline` SHALL be refused. A published but unmerged pull request MAY record `landed-offline` through `pr-local-land finish`.

#### Scenario: A pre-publish offline land is recorded

- **WHEN** a land has no local owner entry and the maintainer records its change and land commit with user approval
- **THEN** the record names the change, archive commit, reviewed tree and land commit
- **AND** the record is written only under `.cache/pr-review/offline-lands.json`

#### Scenario: A mismatched record is refused

- **WHEN** the record's archive commit, reviewed tree or land commit differs from the selected manifest
- **THEN** the record is refused and nothing is written

#### Scenario: The flag alone does not authorize

- **WHEN** `push-landed --offline` runs without a matching record or `landed-offline` phase
- **THEN** the script refuses and does not push

#### Scenario: A published but unmerged pull request is accepted

- **WHEN** the local owner entry is `landed-offline` after the published pull request falls back to the offline land
- **THEN** `push-landed --offline` accepts the phase without a separate record

#### Scenario: The record is cleared after the push

- **WHEN** the deferred push succeeds
- **THEN** the matching offline record is removed

### Requirement: Offline push documentation

`docs/land-push.md` SHALL document the `--offline` mode, the offline-land record, the landed-range gate, the pre-push range check, and recovery for a refused unmerged land. `docs/local-pr.md` SHALL document the record and deferred-push commands. `AGENTS.md` SHALL name the offline record and `push-landed --push --offline`.

#### Scenario: The deferred route is documented

- **WHEN** a maintainer reads the online and offline completion sections
- **THEN** the documents name the lab, land, `offline-land record`, stop and `push-landed --push --offline`
- **AND** they state that the matching record is removed after the push

#### Scenario: The hook refusal is documented

- **WHEN** a maintainer reads the pre-push section
- **THEN** it names the direct-land refusal and the `offline-land record` plus `push-landed --push --offline` recovery commands

#### Scenario: Recovery is documented

- **WHEN** a direct land is refused at the push boundary
- **THEN** the documents name the manual recovery and the offline record path

### Requirement: A run removes its temporary root

When the canonical base resolves, the plain and scoped entrypoints SHALL create one temporary root per run, pass it as `TMPDIR`, and remove it when the run ends, whether tests pass, fail, or the run receives `SIGINT`/`SIGTERM`. The coverage entrypoint SHALL inherit that lifecycle from the runner it starts. `DSH_TEST_KEEP_TMP=1` SHALL keep the root and report its path; a listing run SHALL create none; a cleanup failure SHALL be reported without changing the exit status.

#### Scenario: A passing run removes its root

- **WHEN** every test passes and the run exits
- **THEN** the run root no longer exists

#### Scenario: A failing run removes its root

- **WHEN** at least one test fails and the run exits nonzero
- **THEN** the run root no longer exists
- **AND** the run's exit status is unchanged

#### Scenario: An interrupted run removes its root

- **WHEN** the run receives `SIGINT` or `SIGTERM`
- **THEN** the run root is removed before the process exits
- **AND** the entrypoint exits with the conventional `128 + signal` status

#### Scenario: The keep switch keeps the root

- **WHEN** the run sets `DSH_TEST_KEEP_TMP=1`
- **THEN** exactly one run root is left and its path is reported

#### Scenario: A listing run creates no root

- **WHEN** the scoped entrypoint lists its selection without running tests
- **THEN** no run root is created

#### Scenario: A run without a resolved base keeps the inherited value

- **WHEN** the canonical base cannot be resolved
- **THEN** no run root is created
- **AND** the entrypoint passes the inherited value to the test process

### Requirement: Registered fixtures are removed at file teardown

A test file that registers temporary fixture roots with the shared test-side registry SHALL remove every registered root when the file's tests finish, whether they pass, fail, or stop before their last line. The registry SHALL delete the root the fixture created, including its subdirectories, and SHALL be harmless when a root is already gone.

#### Scenario: A failing test leaves no registered root

- **WHEN** a test whose file registered a fixture root fails and the file's tests finish
- **THEN** that root no longer exists

#### Scenario: A fixture that fails before the test body leaves no registered root

- **WHEN** a fixture registers its root and then throws before the test body runs
- **THEN** the file teardown removes that root

#### Scenario: Subdirectories are removed with the root

- **WHEN** a fixture creates a root with a project tree beneath it
- **THEN** the teardown removes the whole root, not only a descendant directory

#### Scenario: A root already removed by the test is harmless

- **WHEN** a test removes its fixture root through its own cleanup and teardown runs afterwards
- **THEN** teardown reports no failure and the run's exit status is unchanged

### Requirement: A failing signal lifecycle assertion reports the entrypoint stderr

When either `SIGTERM` lifecycle test fails its exit-status or run-root assertion, the message SHALL carry the entrypoint's captured stderr rendered as `entrypoint stderr: <text>` truncated to 500 characters, or `entrypoint stderr: <empty>` when nothing was captured. Both tests SHALL capture that stderr; a passing run SHALL be unaffected.

#### Scenario: A leftover run root reports the entrypoint stderr

- **WHEN** a `SIGTERM` run exits and its run root is still present
- **THEN** the failure message carries the stderr the entrypoint wrote
- **AND** the assertion still reports the directory that survived

#### Scenario: An empty capture is labelled

- **WHEN** the entrypoint writes nothing to stderr before a failing assertion
- **THEN** the message reads `entrypoint stderr: <empty>`

#### Scenario: A clean signal run is unchanged

- **WHEN** a `SIGTERM` run removes its root and exits with status 143
- **THEN** the lifecycle test passes

### Requirement: A signal lifecycle capture is read after stderr closes

The `SIGTERM` lifecycle tests SHALL read the captured stderr when the child's stderr closes or 500 milliseconds after the child exits, whichever happens first, so a descendant holding the inherited pipe cannot hang the run.

#### Scenario: A held stderr pipe does not hang the test

- **WHEN** the child's stderr has not closed 500 milliseconds after the child exits
- **THEN** the test reports the capture it has and still asserts

#### Scenario: A late cleanup line is still reported

- **WHEN** the entrypoint writes its cleanup error just before exiting
- **THEN** the reported text includes that line
