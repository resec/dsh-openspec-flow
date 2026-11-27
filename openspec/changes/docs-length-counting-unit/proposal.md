# Proposal

## Why

The length gate measures a requirement description with JavaScript's `String#length`, which counts UTF-16 code units, so a character outside the Basic Multilingual Plane counts as two. The specification and `docs/review.md` only say "characters", so an author who adds an emoji cannot tell whether the draft will block.

## What Changes

- Name UTF-16 code units as the counting unit in the requirement description growth requirement.
- State the same unit and the emoji consequence in `docs/review.md`.
- Add a regression test that pins the unit at the boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the requirement description growth requirement names UTF-16 code units as its counting unit. The gate, the limit and every existing scenario stay unchanged.

## Impact

- `openspec/specs/change-review/spec.md`: through the delta.
- `docs/review.md`: states the counting unit.
- `test/review-length.test.mjs` and `test/review-doc.test.mjs`: pin the unit in the gate and in the document.
- No behavior change: `lib/review/length.js` already counts with `String#length`.
