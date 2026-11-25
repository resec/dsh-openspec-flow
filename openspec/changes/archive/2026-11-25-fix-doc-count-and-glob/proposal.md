# Proposal

## Why

`index.js` still describes thirteen tools with ten in the core block; the plugin now registers ten tools, seven of them in the core block. `docs/lab.md` also writes the scenario location both recursively and non-recursively, while the discovery code and the lab-harness spec both recurse.

## What Changes

- Correct the counts in the `index.js` header comment.
- Use `test/lab/**/*.scenario.mjs` in both places in `docs/lab.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation and a comment only, so this change sets `skip_specs: true`.

## Impact

- `index.js` (comment), `docs/lab.md` (two phrases).
- No code behavior, dependency, workflow, hook, coverage-baseline or `dist/` change.
