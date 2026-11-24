# Proposal

## Why

`prepare` records the `blocked` phase when the rebase of the landing branch onto `origin/main` conflicts. `listLandingCandidates` skipped only `review-failed` explicitly and treated `OPEN_PHASES` as unfinished, so `blocked` matched neither rule: it fell through to `evaluateLanding`, which passes because the pull request is still `MERGEABLE`. The pull request stayed in `candidates` with no entry in `refused`, and every scheduled run prepared the landing again and repeated the same conflicting rebase.

## What Changes

- Landing candidate discovery refuses every recorded landing phase that is not an open phase, instead of naming `review-failed` and letting any other stopped phase fall through to the gates. A new phase is refused by default rather than re-prepared.
- The refusal for `blocked` names the recorded rebase conflict and its recovery: resolve the conflict and run `prepare` again, or remove the `mergeable` label to give up. Other stopped phases report the phase, the recorded error and `state`/`abandon`.
- `docs/pr-review.md` documents the blocked recovery next to the landing phases.
- Tests: a conflicting `prepare` followed by `candidates` (empty `candidates`, one `refused` entry naming the pull request, the phase and the recovery), and a walk over every phase named in `docs/pr-review.md` asserting none of them becomes a candidate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: the landing candidate discovery requirement names only the `review-failed` phase as a reason to omit a pull request. The required behaviour now covers any stopped landing, so the requirement and its scenarios are modified.

## Impact

- `scripts/pr-review-land.mjs`: the candidate loop and one refusal helper.
- `test/pr-review-land.test.mjs`: two new tests plus a documentation assertion.
- `docs/pr-review.md`: the landing phases paragraph.
- No gate, phase transition, landing state or pull-request write change; no dependency, workflow, hook, coverage-baseline or `dist/` change.
