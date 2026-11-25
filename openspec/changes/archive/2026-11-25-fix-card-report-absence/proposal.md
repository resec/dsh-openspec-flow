# Proposal

## Why

The card spec says a missing report leaves the report body absent, but the payload always wrote `report: null` (and `normalizeJson` turns `undefined` into `null`), so a consumer that asks whether the key exists reads the wrong answer.

## What Changes

- Add the `report` key only when a report body exists.
- Assert the key is absent when the report file cannot be read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The spec already requires the absence; only the payload was wrong, so this change sets `skip_specs: true`.

## Impact

- `lib/review/cards.js`: one property.
- `test/review-cards.test.mjs`: one assertion.
- No schema, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
