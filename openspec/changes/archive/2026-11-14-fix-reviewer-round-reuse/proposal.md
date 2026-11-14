# Reuse the reviewer across review rounds

## Why

The previous change `fix-reviewer-round-activation` treated a new review round as needing a fresh reviewer and added a "Each review round activates its reviewer" requirement to the main spec. That was an over-correction: the original contract starts exactly one reviewer per review, `retry` messages the same reviewer, and `replace` is the only way to start a new one.

This session's history confirms the correct model. Round 2 of `fix-apply-review-without-git` wrote its brief but did not message the existing reviewer; two `wait` calls timed out; after `retry`, the same reviewer (`agent-1`) read the round 2 brief and submitted its report. Round 3 and the apply review rounds behaved the same way. The bug was a missing wake message, not a missing reviewer.

## What Changes

- Remove the incorrect `change-review` requirement "Each review round activates its reviewer" from the main spec.
- Add a requirement that a new draft or apply round with `reviewers: 1` wakes the existing slot reviewer to read the new brief; it never starts another reviewer. Resuming a round without a report does not wake it again. A first round without a slot still activates one, and `replace` remains the only path that starts a new reviewer.
- `startReview` and `startApplyReview` send the wake message to the slot's agent, record the round and wake time, keep the same agent id, and do not append replacement history.
- Tests cover the same agent being messaged and submitting round 2, no new activation, no re-wake on resume, and `replace` still activating a new child.
- `docs/review.md` returns to "each new round wakes the same reviewer; only replace starts a new one".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: remove the fresh-reviewer-per-round requirement and replace it with the single-reviewer wake behavior.

## Impact

- `lib/tools/review.js`: new-round wake in `startReview` and `startApplyReview`; the previous fresh-activation branch is removed.
- `test/review.test.mjs`: the two new-round tests assert messages and a stable slot instead of activations and replacements.
- `docs/review.md`: reviewer round wording.
- `openspec/specs/change-review/spec.md`: the bad requirement is removed and the reuse requirement added at archive.
- No settings, policy format, skill or tool schema change; existing records remain readable.
