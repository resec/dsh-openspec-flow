## Why

The scheduled prompt in `docs/pr-review.md` listed only `prepared`, `reviewed`, `archive-pending` and `review-failed`. `scripts/pr-review-land.mjs` records eight open phases: `OPEN_PHASES` also contains `archive-failed`, `archived`, `push-pending` and `pushed`. The `archive-pending` bullet also ran archive, push and finish in one run, so an interruption after any of them left the landing in a phase the prompt had no instruction for; every later run only reported `already landing in phase X`.

The `pr-review-pipeline` spec already requires the next scheduled run to resume from the recorded landing phase and at most one phase per run, so only the documented prompt was incomplete.

## What Changes

- Give every open phase its own step-3 bullet with the entry condition, the single action, and `then stop`: `prepared`, `reviewed`, `archive-pending`, `archive-failed`, `archived`, `push-pending`, `pushed` and `review-failed`.
- Split `archive-pending` from push and finish: it records the archive commit and stops; `archived` records the pushed head; `pushed` finishes the landing.
- Tell the run to report `tree-mismatch`, `failed` or `blocked` and stop instead of restarting the landing.
- Export `OPEN_PHASES` from the script and assert in `test/pr-review-land.test.mjs` that the prompt names exactly those phases and that each phase instruction stops the run.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `pr-review-pipeline` spec already requires resuming from the recorded landing phase with one phase per run; this change sets `skip_specs: true` because only the prompt that implements that requirement was incomplete.

## Impact

- `docs/pr-review.md`: the scheduled prompt's landing step and the sentence that follows it.
- `scripts/pr-review-land.mjs`: `OPEN_PHASES` export only; no command, phase transition or gate changes.
- `test/pr-review-land.test.mjs`: the documentation test now derives the phase list from the script.
- No dependency, workflow, hook, coverage-baseline or `dist/` change.
