# Make the draft brief neutral about authorship

## Why

The draft brief is shared by both review modes, but its opening says "You wrote this planning material as the changer; review it adversarially." That was true when only `reviewers: 0` self-review existed. With `reviewers: 1`, the independent reviewer, whose persona states "You did not write the change", reads the same sentence and receives two contradictory premises about its role. The same transition left `lib/review/config.js` claiming that `reviewers` accepts 0 only.

## What Changes

- Replace the authorship sentence in the draft brief opening with a neutral request for adversarial review; the other opening sentences stay unchanged.
- Correct the stale `reviewers` range comment in `lib/review/config.js` to 0 or 1.
- State the neutral opening in `docs/review.md` next to the reviewer modes.
- Cover the changer-read and reviewer-read brief with regression tests.

No tool, schema, policy or review-record field changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the draft brief no longer asserts that the reader wrote the planning material; one opening serves both `reviewers: 0` and `reviewers: 1`.

## Impact

- `lib/review/brief.js`: the draft brief opening.
- `lib/review/config.js`: the `reviewers` normalization comment only.
- `docs/review.md`: the reviewer-mode section.
- `test/review.test.mjs`: assertions for both modes.
- Existing stored briefs are not migrated; only briefs written after this change use the neutral opening.
- Rollback is restoring the previous sentence; no record, hash or policy depends on the brief text, because `start` rebuilds and re-hashes the round brief.
