# Tasks

## 1. Guard the stamp at the entrypoint

- [x] 1.1 Add a fixture whose committed instrumented-run stub reports pass, failure, violation or missing lcov without dirtying the tree.
- [x] 1.2 Assert a passing enforce run writes the stamp and leaves the tree clean.
- [x] 1.3 Assert a suite failure, a gate violation and a gate error each delete the stamp.
- [x] 1.4 Assert a report run writes no stamp and keeps an existing one on failure.

## 2. Guard the gate diagnostics

- [x] 2.1 Assert an in-scope file without an lcov record fails enforce mode as `missing coverage record`.
- [x] 2.2 Assert the report renders the baseline range and warns when it differs from `engines.node`.

## 3. Guard the packaging scenarios

- [x] 3.1 Assert a rejected `--force` repack leaves the previous tarball and metadata byte-identical.
- [x] 3.2 Assert the metadata sha512 equals an independently computed digest of the tarball's gzip bytes.
- [x] 3.3 Assert the entrypoint runs only `git` and `npm pack` and names the Plugins-page install step.

## 4. Verify

- [x] 4.1 Run `node --test test/coverage-gate.test.mjs test/pack.test.mjs`: 43 tests pass.
- [x] 4.2 Revert the stamp write, each of the three clear calls and the pre-write content check one at a time, confirm the matching case fails, then restore.
- [x] 4.3 Run `/tmp/b3/gates.sh test-coverage-and-bundle-gaps` and `COVERAGE_SKIP=1 git push -u origin test/coverage-and-bundle-gaps`.
