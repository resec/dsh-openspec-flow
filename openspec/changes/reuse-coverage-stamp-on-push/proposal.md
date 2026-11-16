# Proposal: reuse a passing coverage stamp on push

## Why

The pre-push hook always runs the full instrumented suite, even when the same tree passed verification moments earlier. In the last three days of this repository's activity, 21 of 26 pushes with work to send ran that gate for 62-101 seconds, and 17 of them had a passing verification in the same session within the previous 30 minutes. An archive commit only moves `openspec/` paths, so the coverage inputs are byte-identical to the run that just passed, yet the gate reruns because neither the hook nor the verification entrypoint records what the passing run covered.

## What Changes

- A passing enforce-mode `npm run verify` run SHALL record a stamp at `.cache/coverage-stamp.json`, ignored by version control, holding the Node version, the checked commit, the merge base the new-code check actually resolved, and a fingerprint of the measurement and gate inputs.
- The stamp SHALL be written only when the working tree is clean apart from uncommitted paths under `openspec/changes/`, the effective mode is enforce, the run is not a baseline update, and the gate reported no violation. An enforce run that fails at the same clean commit SHALL clear the stamp for a gate violation, a suite failure, or a gate evaluation error; a preflight failure or a rejected argument SHALL leave it untouched, because those say nothing about the committed inputs. `AGENTS.md` moves the verification step after the implementation commit so the stamp exists when the push needs it.
- The fingerprint SHALL cover the measurement and gate inputs only: `lib/`, `index.js`, `test/`, `package.json`, `package-lock.json`, `coverage.config.json`, `coverage.baseline.json`, and the five gate/entry scripts (`scripts/coverage.mjs`, `scripts/coverage-gate.mjs`, `scripts/coverage-stamp.mjs`, `scripts/run-tests.mjs`, `scripts/node-version.mjs`). It does not cover `skills/`, `README.md` or `docs/review.md`, whose content the suite also asserts; that limit is recorded as a design risk.
- The pre-push hook SHALL run strict validation first, unchanged, then reuse the stamp and skip only the verification rerun when every check holds: the stamp parses, the working tree is clean apart from uncommitted paths under `openspec/changes/`, the committed fingerprint equals the stamped fingerprint, the checked commit is readable, the merge base equals the stamped base, and the Node version equals the stamped version.
- Apart from `COVERAGE_SKIP=1`, every other stamp outcome - missing or corrupt stamp, fingerprint mismatch, base mismatch, Node mismatch, dirty tree - SHALL run `npm run verify`, so an unusable stamp can cost time but never lower the gate.
- The README, `AGENTS.md` and the hook installer message SHALL state what the stamp proves, the verification order, and the full set of invalidation conditions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coverage-gate`: new requirements cover writing, clearing and reusing the stamp, its fingerprint inputs, and the recorded merge base, each with a fail-back scenario.
- `development-workflow`: the strict artifact validation gate gains the reuse path and defers the stamp definition to `coverage-gate` instead of restating it.

## Impact

- New module: `scripts/coverage-stamp.mjs` with the fingerprint computation, the record read, write, clear and failure-clear operations, a repository root that defaults to the repository containing the script, and a `check` command the hook calls.
- Modified: `scripts/coverage-gate.mjs` (export the stamp predicate, the enforce-pass and enforce-fail callbacks, the mode resolver and the resolved base), `scripts/coverage.mjs` (an entry guard plus an exported `runVerification` runner; write on pass and clear on a gate violation, a suite failure and a gate evaluation error), `.githooks/pre-push` (reuse decision between validation and `npm run verify`), `scripts/install-hooks.mjs` (installer message), `test/hooks.test.mjs`, `test/coverage-gate.test.mjs`, `README.md`, `AGENTS.md`.
- New tests: `test/coverage-stamp.test.mjs` for the fingerprint, record round trip, dirty-tree write refusal, dirty-tree clear refusal, failure clear, input change, base change, Node mismatch and corrupt-record fallback.
- The hook keeps its verification entry on one line, which the applied `merge-verification-entry` change has already renamed to `npm run verify`.
- No new dependency, no CLI change and no change to the coverage thresholds, the baseline values or the test suites.
