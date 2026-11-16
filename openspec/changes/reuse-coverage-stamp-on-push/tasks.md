# Tasks

## 1. Stamp module and fingerprint

- [x] 1.1 Add `scripts/coverage-stamp.mjs` with the fixed input list (`lib`, `index.js`, `test`, `package.json`, `package-lock.json`, `coverage.config.json`, `coverage.baseline.json`, `scripts/coverage.mjs`, `scripts/coverage-gate.mjs`, `scripts/coverage-stamp.mjs`, `scripts/run-tests.mjs`, `scripts/node-version.mjs`), a fingerprint over `git rev-parse HEAD:<path>`, `readStamp`/`writeStamp`/`clearStamp`/`clearStampOnFailure`, and a `check` command; the root defaults to the repository containing the script and `--root` exists for fixture tests; `writeStamp` and `clearStamp` SHALL refuse when `git status --porcelain` is non-empty, where a refusal is a non-throwing no-op that reports its reason and leaves the run's exit code unchanged; `clearStampOnFailure` SHALL delegate only for `mode === 'enforce' && !updateBaseline`; run `node --test test/coverage-stamp.test.mjs` and verify the fingerprint ignores `openspec/` changes
- [x] 1.2 Add `test/coverage-stamp.test.mjs` with a throwaway git repository fixture that ignores `.cache/` and is created directly rather than through `test/review-fixtures.mjs`; build two commits differing only under `openspec/`, write the stamp, and verify a match; cover a missing stamp, an unsupported `version`, corrupt JSON, a dirty tree on write (assert the record is unchanged and the call returns a refusal), a dirty tree on clear (assert the record is unchanged and the call returns a refusal), a failed-run clear, a report-mode non-clear, a baseline-update non-clear, a changed `lib/` file, a changed `test/` file, a baseline-only change, a gate-script change, a moved base and a different Node version, and verify each result against the spec while `check` exits nonzero where the spec says it refuses reuse
- [x] 1.3 Make every failure path in `check` exit nonzero and state the reason: verify a missing input path, a missing git repository, an unresolvable base and an unreadable stamp file each fall back instead of passing

## 2. Mint and clear decisions

- [x] 2.1 Add an `import.meta.url` entry guard to `scripts/coverage.mjs` and export `runVerification({ root, argv, version })`, which the CLI entry calls with the process values; export `shouldRecordStamp({ mode, updateBaseline, code, violations })`, `resolveBase` and `resolveMode` from the gate, and add `onEnforcePass({ base })` / `onEnforceFail` callbacks invoked only after the `updateBaseline` early return; `runGate` SHALL resolve its effective mode through the exported `resolveMode`, which throws a `GateError` for an unknown mode exactly as the gate does today, so one rule serves both the verdict and the stamp decision; `onEnforcePass` receives the merge base the gate actually resolved; verify an `update-baseline` run that reports violations returns `0` and fires neither callback
- [x] 2.2 Wire `scripts/coverage.mjs` to `writeStamp` on `onEnforcePass` and to `clearStampOnFailure` on the suite-failure early return, on a caught error raised by the `runGate` call itself, and on `onEnforceFail`; a preflight failure (`assertCurrentNode`) or a rejected argument (`parseArgs`) must leave the stamp untouched; report mode and baseline updates write and clear nothing; verify `node scripts/coverage.mjs --report-only` writes no stamp, a violated run removes the previous one, a failing suite removes it, a gate error removes it, and a wrong-Node or unknown-argument run keeps it
- [x] 2.3 Extend `test/coverage-gate.test.mjs` with the predicate truth table (enforce/non-enforce, update-baseline, zero/nonzero code, zero/nonzero violations), a `runGate` call with stub callbacks asserting the passed base, the `update-baseline` path firing neither callback, and a `resolveMode` case for a requested mode, a config fallback and an unknown-mode `GateError`; prove the preflight/argument exclusion by calling the exported `runVerification({ root: fixtureRoot, argv: ['--bogus'] })` and `runVerification({ root: fixtureRoot, argv: [], version: 'v22.0.0' })`, asserting each throws before the suite starts and leaves the fixture's own stamp untouched; the entry guard added in 2.1 makes importing `scripts/coverage.mjs` safe in a test, so never execute a full run and never spawn one

## 3. Reuse in the pre-push hook

- [x] 3.1 Insert the check into `.githooks/pre-push` after `npm run openspec:check` and after the `COVERAGE_SKIP` branch, leaving the `npm run verify` line intact; verify a matching stamp prints the reused commit and skips verification, a failing check runs `npm run verify`, and `COVERAGE_SKIP=1` skips verification without running the check
- [x] 3.2 Extend `test/hooks.test.mjs` with a fake `node` on `PATH` that records its arguments and exits with the scenario's code; verify the matching-stamp, stale-stamp, failed-validation and `COVERAGE_SKIP` cases each assert the exact npm and node calls
- [x] 3.3 Update the installer message in `scripts/install-hooks.mjs` and the hook paragraph in `README.md` to name the stamp check, the invalidation conditions (missing or unparsable stamp, dirty tree, fingerprint mismatch, base mismatch, Node mismatch) and the `COVERAGE_SKIP` exception; verify both name `.cache/coverage-stamp.json` and both list all five invalidators

## 4. Document the workflow contract

- [x] 4.1 Update `AGENTS.md`'s Verification section: move the `npm run verify` step after the implementation commit, state that the hook reuses a verified stamp, and name the invalidation conditions; verify the text matches the hook behavior in §3
- [x] 4.2 Re-read the two delta specs against the implementation wording and fix any drift; run `openspec_inspect` with `action: "validate"` and `strict: true` and verify no warnings

## 5. Integration verification

- [x] 5.1 Commit the implementation, run `npm run verify` on Node 24, and verify it passes and writes a stamp that `node scripts/coverage-stamp.mjs check` accepts immediately afterwards
- [ ] 5.2 Commit an `openspec/`-only change on top of that commit and run the check; verify it still accepts the stamp, then commit a `lib/` change and verify the refusal comes from the fingerprint comparison, not the dirty-tree guard

## Workflow follow-up

- Seal the ready draft with a commit that stages only the change directory and, when written, `openspec/.gitignore`.
- Start apply only when the user asks; commit the implementation and run the apply review before archive.
- Archive and push only when the user asks.
