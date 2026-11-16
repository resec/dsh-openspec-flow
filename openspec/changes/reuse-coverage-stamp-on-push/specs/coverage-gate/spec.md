# Spec Delta: coverage-gate

## ADDED Requirements

### Requirement: Coverage stamp on a passing enforce run

After an enforce-mode verification run passes, the entrypoint SHALL write a stamp to `.cache/coverage-stamp.json` under the repository root. The file SHALL be ignored by version control. The stamp SHALL be written only when the effective mode is enforce, the invocation does not update the baseline, the gate reports no violation, and the working tree is clean apart from uncommitted paths under other `openspec/changes/` directories, which do not take part in a coverage verdict.

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

- **WHEN** an enforce run fails while `git status --porcelain` reports an entry
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

- **WHEN** the gate passes while `git status --porcelain` reports an entry outside another change's directory
- **THEN** the writer refuses, reports the reason, and no stamp is written
- **AND** the run keeps the exit code the gate produced

#### Scenario: Another change's uncommitted planning files do not block the stamp

- **WHEN** the only uncommitted path is under `openspec/changes/<other>/`
- **THEN** the tree counts as clean for the stamp and the writer records it

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

Apart from `COVERAGE_SKIP=1`, the pre-push hook SHALL skip `npm run verify` only when the stamp parses, the working tree is clean, the committed fingerprint equals the stamped fingerprint, the checked commit is readable, the resolved merge base matches, and the running Node version equals the stamped version. Every other stamp outcome SHALL run verification.

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

- **WHEN** the stamp is missing, unreadable, unsupported or the working tree is dirty
- **THEN** the hook runs verification

#### Scenario: COVERAGE_SKIP still wins

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** the hook skips verification without evaluating the stamp
