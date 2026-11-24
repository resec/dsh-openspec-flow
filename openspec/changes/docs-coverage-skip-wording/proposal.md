# Proposal

## Why

The pre-push hook exits before `npm run verify` when `COVERAGE_SKIP=1` is set, so the flag skips the whole instrumented run: the unit tests and the coverage verdict together. Three documents said it "skips only coverage", which reads as if the tests still ran.

## What Changes

- State in `docs/lab.md` that `COVERAGE_SKIP=1` skips the whole `npm run verify` run.
- State the same in `AGENTS.md`, `README.md` and the message `scripts/install-hooks.mjs` prints.
- Pin the corrected sentence in `test/lab-doc.test.mjs` so the old wording fails the doc test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The coverage specs already say `COVERAGE_SKIP=1` skips verification without evaluating the stamp, and the hook already behaves that way; only the prose disagreed, so this change sets `skip_specs: true`.

## Impact

- `docs/lab.md`, `AGENTS.md`, `README.md`: one sentence each.
- `scripts/install-hooks.mjs`: the install message text.
- `test/lab-doc.test.mjs`: the pinned wording.
- No behavior, spec, hook, workflow, dependency, coverage-baseline or `dist/` change.
