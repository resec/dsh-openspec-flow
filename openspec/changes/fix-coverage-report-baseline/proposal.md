# Proposal

## Why

The gate warns and exits zero when `coverage.baseline.json` is missing or unusable in report mode, so `npm run coverage -- --report-only` can look like a pass while the delta guard never ran. The spec already requires missing-lcov, invalid-baseline, preflight and test failures to stay nonzero in both modes.

## What Changes

- Throw for a missing baseline in report mode as well.
- Throw for an unusable baseline in report mode as well; `--update-baseline` still tolerates a missing or unusable one, because writing a baseline is the point there.
- Coverage violations keep their per-mode behavior: report mode prints them, enforce mode fails.
- Add a test for both report-mode failures.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The spec already states the rule; the gate now matches it, so this change sets `skip_specs: true`.

## Impact

- `scripts/coverage-gate.mjs`: two branch conditions.
- `test/coverage-gate.test.mjs`: one test.
- No dependency, workflow, hook, baseline or `dist/` change.
