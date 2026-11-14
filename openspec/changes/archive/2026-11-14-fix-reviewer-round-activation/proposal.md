# Fix reviewer activation on later review rounds

## Why

`openspec_review` starts an independent reviewer only when the review record has no reviewer slot. With `reviewers: 1`, a second draft or apply round writes a new brief but never wakes a reviewer: `wait` reports that the reviewer has not submitted, and the only workaround is a manual `retry`. Every multi-round review therefore stalls on its second round, even though the brief, round record and wait limits are correct.

## What Changes

- `startReview` and `startApplyReview` distinguish a new round (the latest round already has a report) from resuming an unreported round. With `reviewers: 1`, a new round starts a fresh reviewer activation and points the recorded slot at the new child; resuming an unreported round does not start another.
- The slot records the new activation's round, the prior agent id and a replacement entry naming the new round; the retry count resets for the new activation. The reviewer tool still accepts submissions only from the current slot agent, so the previous reviewer cannot report on the new round.
- Tests cover draft round 2, apply round 2, a resumed unreported round (no duplicate activation) and the old reviewer's rejected submission.
- `docs/review.md` states that each new round activates a fresh reviewer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: each new draft or apply round activates a fresh independent reviewer; resuming an unreported round does not.

## Impact

- `lib/tools/review.js`: round selection and reviewer activation in `startReview` and `startApplyReview`.
- `test/review.test.mjs`: new round-activation regression cases.
- `docs/review.md`: reviewer round behavior.
- No settings, tool schema, policy format or skill change; the review record only gains additive slot fields.
