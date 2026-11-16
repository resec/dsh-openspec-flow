# Delta for coverage-gate

## MODIFIED Requirements

### Requirement: Coverage stamp fingerprint covers the verdict inputs

The stamp's fingerprint SHALL be computed over `lib/`, `index.js`, `test/`, `package.json`, `package-lock.json`, `coverage.config.json`, `coverage.baseline.json`, `scripts/coverage.mjs`, `scripts/coverage-gate.mjs`, `scripts/coverage-stamp.mjs`, `scripts/run-tests.mjs`, `scripts/test-env.mjs` and `scripts/node-version.mjs`, read from the committed tree. A path that is absent SHALL make the fingerprint unverifiable rather than silently ignored.

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

#### Scenario: A test-environment change invalidates the stamp

- **WHEN** only `scripts/test-env.mjs` differs from the stamped commit
- **THEN** the fingerprint differs and the stamp is not reused
