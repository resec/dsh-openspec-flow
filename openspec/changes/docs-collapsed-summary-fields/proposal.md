# Proposal

## Why

`openspec/specs/review-cards/spec.md` describes the collapsed summary three times. The requirement "The client renders a collapsed card" (line 96) lists only the title, the round, the verdict and the severity counts. The change-name requirement (lines 349-362) puts the recorded change name between the phase title and the review kind, and the extra-round requirement (lines 517-529) makes the summary show `roundToken` instead of the numeric round. The client (`client.js`, `cardSummary`) renders the phase title, the change name, the review kind, the round token, the verdict and the four severity counts, so the first requirement has fallen behind the other two.

## What Changes

- Restate the field set in "The client renders a collapsed card" as one ordered list that matches the client: phase title, change name, review kind, round token, verdict, four severity counts.
- Name `roundToken` in the collapsed-card scenarios.
- Leave the change-name requirement and the extra-round-token requirement unchanged; they keep owning their segments.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-cards`: the collapsed-card requirement names the same field set the client renders.

## Impact

- `openspec/specs/review-cards/spec.md`: through the delta.
- No code change: `client.js` `cardSummary` already renders these fields and `docs/review.md` already documents the same order.
- `test/review-doc.test.mjs`: the card-shape assertion pins the whole summary order so a dropped field fails the test.
