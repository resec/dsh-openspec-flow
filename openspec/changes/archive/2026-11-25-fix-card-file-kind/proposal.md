# Proposal

## Why

Card files are named `cards/<sessionKey>-<phase>-<round>.json`, without the review kind, and draft and apply records share one directory and both start at round 1. When one session submits a draft self-report and then an apply self-report for round 1, the second card overwrites the first, while both records keep a marker saying the card was written — so the lost card is never rewritten.

## What Changes

- Name card files `cards/<sessionKey>-<kind>-<phase>-<round>.json` and carry the kind in the card marker.
- Keep a card written under the earlier kind-less name readable; nothing is migrated or rewritten.
- State the new layout, and the readable earlier name, in `docs/review.md` and in the two requirements that describe it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-cards`: the card-file requirement names the kind and keeps the earlier name readable.
- `review-documentation`: the record-layout requirement states the kind in the card name.

## Impact

- `lib/review/cards.js`: the file name and the marker.
- `docs/review.md`, `test/review-doc.test.mjs`, `test/review-cards.test.mjs`, `test/review-cards-endpoint.test.mjs`.
- No change to the card payload, the delivery rules, the record files, dependencies, workflows, hooks, the coverage baseline or `dist/`.
