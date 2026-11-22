# Proposal

## Why

An apply round chooses its base from an explicit `base`, the draft seal commit, the recorded base, or `git merge-base`. The recorded `baseSource` was inherited from an earlier round whenever the caller omitted `base`, so a later round could print the seal commit while its brief said "the explicit base passed to this review", and the record kept the stale source.

## What Changes

- Derive `baseSource` from the branch that actually selected the base; for a no-draft resume keep the source recorded with the inherited base.
- Persist that source when a resume opens a round, so the record and the brief agree.
- Add a test that starts with an explicit base, disposes a finding and resumes without `base`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The brief contract already requires the source to match the base; only the recorded value was wrong, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: the source computation and the resume write.
- `test/review-apply.test.mjs`: one new test.
- No schema, record shape, dependency, workflow, hook, coverage-baseline or `dist/` change.
