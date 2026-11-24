# Proposal

## Why

The `coverage-gate` spec requires the verification entrypoint to write the stamp on a passing enforce run and to clear it on a suite failure, a gate violation and a gate error, while leaving it alone for a preflight failure, a report run and a baseline update. `runVerification` was only exercised for the two preflight paths, so deleting the write or any of the three clear calls left the suite green.

The same gap exists in the gate's diagnostics and in packaging. `missing coverage record: …` and the baseline-range warning had no assertion, and `bundle-packaging`'s "A forced repack fails the content check", "The entrypoint finishes" and "An installed version is replaced" scenarios were unasserted: no test compared the previous artifact bytes after a rejected `--force` repack, pinned the sha512 to the tarball's gzip bytes, or refused a plugin-manager call from the entrypoint.

## What Changes

- Drive `runVerification` end to end against a fixture whose instrumented-run stub reports pass, failure or missing lcov, and assert the stamp is written on a pass and deleted for each failing path.
- Assert a report-mode run writes no stamp and a failing report run keeps an existing one.
- Assert an in-scope file without an lcov record is reported as `missing coverage record` and fails enforce mode.
- Assert the report renders the baseline range and warns when it differs from the current `engines.node`.
- Snapshot both artifact files, then assert a rejected `--force` repack leaves them byte-identical.
- Recompute the tarball's sha512 in the test from the gzip bytes and assert the metadata matches that independent digest, not the digest of the inflated tar.
- Assert the pack entrypoint invokes only `git` and `npm pack`, and that its output names the tarball and the Plugins-page install step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `coverage-gate` already requires the stamp write and each clear path, and `bundle-packaging` already requires an unchanged pair after a rejected repack, the sha512 of the tarball bytes, and no plugin-manager call. Only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/coverage-gate.test.mjs`: one fixture helper and seven cases.
- `test/pack.test.mjs`: three cases.
- No production code, dependency, workflow, coverage-baseline or `dist/` change.
