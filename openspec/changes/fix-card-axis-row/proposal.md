# Proposal

## Why

The expanded card must show every recorded report finding field, and `axis` is a required finding field. `client.js` rendered problem, evidence, impact, rule, failure and suggestion only, so the category a finding belongs to was invisible in the conversation.

## What Changes

- Add a `类别` row that carries the finding's `axis`, next to the other recorded fields.
- Extend the expanded-card test to assert the row and its value.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The card spec already requires every recorded finding field; only the rendering was incomplete, so this change sets `skip_specs: true`.

## Impact

- `client.js`: the finding row list.
- `test/review-client.test.mjs`: one expectation and one value assertion.
- No payload, record, dependency, workflow, hook, coverage-baseline or `dist/` change.
