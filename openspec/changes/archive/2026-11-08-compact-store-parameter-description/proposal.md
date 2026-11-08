# Compact store parameter descriptions

## Why

Eleven tools repeat the same `store` guidance in their JSON Schema. The repeated clause costs 513 characters in the model-facing definition block on every request, while store usage is rare in the recorded sessions: 2 calls out of 625. The guidance that matters — pass the same `store` on every call when the change lives in a store — is already in the `openspec-apply-change` skill, so the schema copy is redundant.

## What Changes

- Replace the eleven `store` parameter descriptions with the single sentence `Registered store id.`
- Add a regression test that walks every registered tool and asserts the uniform description.
- Add a `tool-surface` requirement fixing the uniform, short description as the contract.
- No store capability, runtime behavior, output field, skill or README change. The `store_id` result-field description in `ROOT_SCHEMA` stays as is.

## Capabilities

### Modified Capabilities

- `tool-surface`: the description contract gains a requirement that a parameter shared by several tools uses one identical short description, and that the `store` parameter is described as `Registered store id.` on every tool.

## Impact

- `lib/tools/query.js` (7 descriptions), `lib/tools/write.js` (2), `lib/tools/apply.js` (2)
- `test/descriptions.test.mjs` (new uniformity assertion)
- No API, dependency, schema version or configuration change.
- Measured effect: 11 descriptions shrink from 898 to 385 characters; the serialized `store` parameter blocks shrink from 1,107 to 594 characters, saving 513 characters per request (about 147 tokens at 3.5 characters per token).
