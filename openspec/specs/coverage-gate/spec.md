# coverage-gate Specification

## Purpose
Defines how the repository measures and gates line, branch, and function coverage for the plugin scope on the primary Node runtime.

## Requirements

### Requirement: Runtime preflight for tests and coverage

Test and coverage commands SHALL start only when the `node` process running them has the major version and a concrete version satisfying the `engines.node` bound recorded in `project-invariants`. The check SHALL fail before any test starts and SHALL NOT invoke fnm, nvm, volta, or any other version manager.

#### Scenario: Primary runtime is accepted

- **WHEN** the command runs on a release with the registry's major version that satisfies its `engines.node` bound
- **THEN** the preflight passes and the test suite starts

#### Scenario: Non-primary major is rejected

- **WHEN** the command runs on a release whose major differs from the registry's
- **THEN** the preflight prints the current version and the required major
- **AND** exits nonzero before any test starts

#### Scenario: Below the declared range is rejected

- **WHEN** the command runs on a release of the registry's major that is below its `engines.node` bound
- **THEN** the preflight rejects the runtime and no test starts

#### Scenario: No version manager is required

- **WHEN** only a `node` executable is on PATH and no fnm, nvm, or volta is installed
- **THEN** the preflight still runs and accepts a runtime that satisfies the registry

### Requirement: Single-pass coverage collection

When coverage recording is enabled, the test command SHALL collect lcov during the same test execution that produces the test results. The gate SHALL consume that lcov and SHALL NOT run the test suites again.

#### Scenario: Coverage is enabled

- **WHEN** `COVERAGE=1` is set and the test command runs
- **THEN** the same run writes the scope lcov file and prints one test summary

#### Scenario: Coverage is disabled

- **WHEN** `COVERAGE` is unset and the test command runs
- **THEN** no lcov file is written

#### Scenario: Gate consumes an existing run

- **WHEN** the coverage gate evaluates a completed instrumented run
- **THEN** it reads the recorded lcov and does not spawn a test process again

### Requirement: Overall coverage floors

Each scope SHALL meet the line, branch and function floors recorded in `project-invariants` on its global aggregate.

#### Scenario: Floors are met exactly

- **WHEN** a scope reports exactly the registry's line, branch and function floors
- **THEN** the overall floor check passes

#### Scenario: A floor is missed

- **WHEN** a scope reports branch coverage below the registry's branch floor
- **THEN** the gate reports the branch shortfall with the scope name

### Requirement: Coverage delta guard

Each scope and metric SHALL stay within 1.00 percentage point below its recorded baseline. A drop of exactly 1.00 point SHALL pass; a larger drop SHALL fail.

#### Scenario: Allowed drop

- **WHEN** the current branch coverage is 1.00 point below the baseline
- **THEN** the delta check passes

#### Scenario: Excessive drop

- **WHEN** the current branch coverage is 1.01 points below the baseline
- **THEN** the delta check reports a violation

### Requirement: New-code coverage

For lines added or modified since `git merge-base origin/main HEAD`, the gate SHALL require line coverage of at least 95.00 percent, branch coverage of at least 90.00 percent, and function coverage of 100.00 percent. Untracked source files SHALL count as fully new.

#### Scenario: New code misses a function

- **WHEN** one new function has no recorded call
- **THEN** the new-code function check fails

#### Scenario: No new executable code

- **WHEN** the diff contains no added or modified executable lines
- **THEN** the new-code checks report not applicable and do not fail

### Requirement: Baseline Node validation

The baseline SHALL record the concrete Node version and the `engines.node` range used when it was generated. The gate SHALL accept different patch versions when both the current and baseline versions have major 24 and satisfy the current `engines.node`; it SHALL reject an invalid baseline.

#### Scenario: Patch versions differ

- **WHEN** the baseline records v24.22.2 and the current runtime is v24.9.0
- **THEN** the baseline is accepted and the report notes the patch difference

#### Scenario: Baseline from another major

- **WHEN** the baseline records a Node 26 version
- **THEN** the gate rejects the baseline and requires regeneration

#### Scenario: Range changed

- **WHEN** `engines.node` becomes `>=24.25.0` and the baseline records v24.22.2
- **THEN** the baseline is rejected and regeneration is required

### Requirement: Baseline ratchet

Updating the baseline SHALL refuse to lower any scope or metric unless the caller supplies an explicit override and reason. An accepted update SHALL record the concrete Node version and current `engines.node` range.

#### Scenario: Coverage improves

- **WHEN** the current figures exceed the baseline and the update command runs
- **THEN** the baseline is raised and records the current Node version

#### Scenario: Coverage would drop

- **WHEN** a metric would be lowered without the explicit override
- **THEN** the update is refused and the existing baseline is unchanged

#### Scenario: Lowering is justified

- **WHEN** the caller supplies the override and a reason
- **THEN** the baseline is lowered and the reason is recorded

### Requirement: Report and enforce modes

The gate SHALL support a report mode that prints coverage violations without failing and an enforce mode that fails on them. Preflight, missing-lcov, invalid-baseline, and test failures SHALL remain nonzero in both modes.

#### Scenario: Report mode

- **WHEN** a scope misses a floor while the gate runs in report mode
- **THEN** the violation is printed and the command exits zero

#### Scenario: Enforce mode

- **WHEN** a scope misses a floor while the gate runs in enforce mode
- **THEN** the command exits nonzero

#### Scenario: Tests fail

- **WHEN** the instrumented test run fails
- **THEN** the command returns the test failure and does not evaluate coverage

### Requirement: Plugin coverage scope

The gate SHALL evaluate a single plugin scope that includes `index.js` and `lib/**/*.js`. Test files and `node_modules` SHALL be excluded.

#### Scenario: The scope is reported

- **WHEN** the gate evaluates a completed run
- **THEN** the report shows line, branch and function figures for the plugin scope

#### Scenario: An in-scope source file has no coverage record

- **WHEN** a file in the plugin scope is absent from lcov
- **THEN** the gate reports a missing-coverage violation for that file

### Requirement: Coverage stamp on a passing enforce run

After an enforce-mode verification run passes, the entrypoint SHALL write a stamp to `.cache/coverage-stamp.json` under the repository root. The file SHALL be ignored by version control. The stamp SHALL be written only when the effective mode is enforce, the invocation does not update the baseline, the gate reports no violation, and the working tree is clean apart from uncommitted paths under `openspec/changes/`, which do not take part in a coverage verdict.

#### Scenario: A passing enforce run on a clean tree writes the stamp

- **WHEN** `npm run verify` completes with no violation and the working tree is clean
- **THEN** `.cache/coverage-stamp.json` records the Node version, the checked commit, the resolved merge base and the input fingerprint
- **AND** `git status` stays clean

#### Scenario: A gate violation clears the stamp

- **WHEN** an enforce run on a clean tree reports a coverage violation
- **THEN** the stamp is deleted, so the next check runs verification

#### Scenario: A suite failure clears the stamp

- **WHEN** the instrumented suite fails before the gate evaluates coverage, in enforce mode and on a clean tree
- **THEN** the stamp is deleted, so the next check runs verification

#### Scenario: A gate error clears the stamp

- **WHEN** the evaluation throws because lcov or the baseline is unusable, in enforce mode and on a clean tree
- **THEN** the stamp is deleted, so the next check runs verification

#### Scenario: A preflight failure keeps the stamp

- **WHEN** the run stops before evaluation - a wrong Node version, an unknown argument, or a missing `--reason` - in enforce mode
- **THEN** the stamp is left untouched, because the failure says nothing about the committed inputs

#### Scenario: A dirty tree keeps the stamp

- **WHEN** an enforce run fails while `git status --porcelain` reports an entry outside `openspec/changes/`
- **THEN** the clear is refused and the existing stamp is left untouched

#### Scenario: A baseline update does not write the stamp

- **WHEN** the entrypoint runs with `--update-baseline`
- **THEN** the baseline is written and no stamp is written or cleared, even when the invocation reports no violation

#### Scenario: A report run does not write the stamp

- **WHEN** the entrypoint runs in report mode
- **THEN** it prints the report and writes no stamp

### Requirement: A refused stamp write is a no-op

The writer SHALL refuse a dirty working tree. Because the write runs inside the gate's pass callback, a refusal SHALL be a non-throwing no-op that reports its reason and leaves the run's exit code unchanged.

#### Scenario: A dirty tree does not write the stamp

- **WHEN** the gate passes while `git status --porcelain` reports an entry outside `openspec/changes/`
- **THEN** the writer refuses, reports the reason, and no stamp is written
- **AND** the run keeps the exit code the gate produced

#### Scenario: Uncommitted planning files do not block the stamp

- **WHEN** the only uncommitted paths are under `openspec/changes/`, including this change's own directory
- **THEN** the tree counts as clean for the write, the clear and the reuse check
- **AND** the writer records the stamp

### Requirement: Coverage stamp fingerprint covers the verdict inputs

The stamp's fingerprint SHALL be computed over `lib/`, `index.js`, `test/`, `package.json`, `package-lock.json`, `coverage.config.json`, `coverage.baseline.json`, `scripts/coverage.mjs`, `scripts/coverage-gate.mjs`, `scripts/coverage-stamp.mjs`, `scripts/run-tests.mjs` and `scripts/node-version.mjs`, read from the committed tree. A path that is absent SHALL make the fingerprint unverifiable rather than silently ignored.

#### Scenario: A path set is fingerprinted

- **WHEN** the stamp is written or checked
- **THEN** the fingerprint covers every listed path or reports the missing one
- **AND** two commits with byte-identical listed inputs yield the same fingerprint even when their other paths differ

#### Scenario: A baseline-only change invalidates the stamp

- **WHEN** only `coverage.baseline.json` differs from the stamped commit
- **THEN** the fingerprint differs and the stamp is not reused

#### Scenario: A gate-script change invalidates the stamp

- **WHEN** only a listed script under `scripts/` differs from the stamped commit
- **THEN** the fingerprint differs and the stamp is not reused

#### Scenario: A missing input refuses verification

- **WHEN** a listed path cannot be read from the committed tree
- **THEN** the check reports it and does not reuse the stamp

### Requirement: Coverage stamp records the resolved comparison base

The stamp SHALL record the merge-base commit the gate actually resolved for the new-code check, and the reuse check SHALL compare it with the base resolved at push time. A missing, unresolvable or different base SHALL refuse reuse.

#### Scenario: The resolved base is recorded and compared

- **WHEN** the stamp is written after a run with or without an explicit base
- **THEN** it records the merge base the gate used, not a separately recomputed one
- **AND** a check that resolves the same base accepts it

#### Scenario: A moved base refuses reuse

- **WHEN** `origin/main` advances or is rewritten so the resolved merge base differs from the recorded one
- **THEN** the check refuses the stamp and the hook runs verification

### Requirement: Coverage stamp reuse on push

Apart from `COVERAGE_SKIP=1`, the pre-push hook SHALL skip `npm run verify` only when the stamp parses, the working tree is clean apart from uncommitted paths under `openspec/changes/`, the committed fingerprint equals the stamped fingerprint, the checked commit is readable, the resolved merge base matches, and the running Node version equals the stamped version. Every other stamp outcome SHALL run verification.

#### Scenario: A matching stamp skips verification

- **WHEN** the stamp parses, the tree is clean, the fingerprint, base and Node version match and `COVERAGE_SKIP` is unset
- **THEN** the hook skips `npm run verify` and states which stamp it reused

#### Scenario: An archive commit keeps the stamp usable

- **WHEN** the only change since the stamped commit is an archive under `openspec/`
- **THEN** the fingerprint and base still match and the hook skips verification

#### Scenario: An input change invalidates the stamp

- **WHEN** any fingerprinted path differs from the stamped commit
- **THEN** the hook runs verification

#### Scenario: A runtime change invalidates the stamp

- **WHEN** the running Node version differs from the stamped version
- **THEN** the hook runs verification

#### Scenario: An unverifiable stamp runs verification

- **WHEN** the stamp is missing, unreadable, unsupported or the working tree is dirty outside `openspec/changes/`
- **THEN** the hook runs verification

#### Scenario: COVERAGE_SKIP still wins

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** the hook skips verification without evaluating the stamp
