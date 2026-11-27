# Proposal

## Why

The requirement "Land takes over the apply lock" says a dead owner SHALL use `recover`, and `lib/worktree/land.js` refuses with a `recover` instruction, but its "A dead owner uses recover" scenario promises the opposite: it says land then acquires the free lock and replaces the state token/pid. `test/worktree-land.test.mjs` pins the refusal, so the scenario is the only artifact that disagrees.

## What Changes

- Rewrite the THEN of the "A dead owner uses recover" scenario: land reports `recover` and refuses, and the user recovers the lock before retrying land.
- Keep the requirement title, description and every other scenario exactly as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: the dead-owner scenario describes the refusal and the user-side recovery instead of a takeover by land.

## Impact

- `openspec/specs/apply-worktree/spec.md`: through the delta.
- No code change: `lib/worktree/land.js` and `test/worktree-land.test.mjs` already behave and assert this way.
