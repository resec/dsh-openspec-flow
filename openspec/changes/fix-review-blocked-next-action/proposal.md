# Proposal

## Why

A reviewer may submit `verdict: "blocked"` when the review cannot be performed, and such a report carries no findings so that the round reviews no content. Readiness still refuses the review because the latest verdict is not `pass`, which is correct. The next action, however, falls through to `openspec_review action=dispose review=<kind>`, and there is no finding to dispose: the call cannot succeed, so the changer is told to repeat a step that always fails. Both reviewer modes and both review kinds are affected.

## What Changes

- Treat a latest report whose verdict is `blocked` or `changes-requested`, with no finding open, as a state that the next round clears, so `nextAction` becomes `openspec_review action=resume review=<kind>`.
- Keep the existing precedence: an open finding still names `dispose`, a missing report still names `wait` or `self-report`, and a stale object, a fixed-but-unverified finding, the requirement length gate or the execution preflight still name `resume`. A stale blocked round keeps its `blockedReason: "stale-object"` path.
- Add tests for self and reviewer modes and for draft and apply reviews, and assert the next action on the existing stale blocked submit.
- State the new step in `docs/review.md`, `README.md` and the propose and apply skills.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review` already requires `resume` to open a new round when the latest round has a report and no recorded finding is open, and `tool-surface` scopes the `dispose` next action to the case where a finding is open. Only the implementation lagged, so this change sets `skip_specs: true`.

## Impact

- `lib/review/readiness.js`: the `needsRound` computation.
- `test/review-unit.test.mjs`, `test/review-draft.test.mjs`, `test/review-wait.test.mjs`, `test/review-reviewer.test.mjs`: the new next-action assertions.
- `docs/review.md`, `README.md`, `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`: the described next step.
- No record, payload, dependency, workflow, hook, coverage-baseline or `dist/` change.
