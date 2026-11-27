# Proposal

## Why

`openspec/specs/tool-surface/spec.md` requires every parameter accepted by multiple tools to use one identical description that states only what the value is. The `change` parameter had three descriptions across the registered tools, and two tool-level descriptions repeated how to use `store`. The description test only compared `store`, so the drift passed CI.

## What Changes

- Describe `change` as `Change name.` on every tool that accepts it, matching the short noun-phrase tone of `Registered store id.`.
- Remove the store usage sentence from the `openspec_inspect` and `openspec_store_list` tool descriptions; the parameter keeps the single `Registered store id.` description.
- Derive shared parameter names in `test/descriptions.test.mjs` from tools that expose the same name more than three times, assert one identical description per shared name, and assert no tool-level description carries `Pass store` or `Use it before asking for a store id`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The tool-surface spec already requires a uniform shared description and forbids repeated store guidance in the schema; only the implementation and its test lagged, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/query.js`, `lib/tools/apply.js`, `lib/tools/worktree.js`, `lib/tools/write.js`, `lib/tools/review.js`: description strings only.
- `test/descriptions.test.mjs`: shared-parameter scan and the store-guidance guard.
- No parameter name, type, required flag, behavior, dependency, hook, coverage-baseline or `dist/` change.
