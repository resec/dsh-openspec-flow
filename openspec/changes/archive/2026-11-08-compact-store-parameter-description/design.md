# Design: compact store parameter descriptions

## Context

See `proposal.md` — Why. The tool definitions are assembled from `lib/tools/query.js`, `lib/tools/write.js` and `lib/tools/apply.js`. Each of the eleven `store` parameters currently carries a 54–89 character sentence that repeats usage guidance already present in `skills/openspec-apply-change/SKILL.md:20`.

## Goals / Non-Goals

- Goal: one identical, short description for `store` on every tool.
- Goal: a regression test that fails when a future edit breaks uniformity or brevity.
- Non-goal: changing how `store` is resolved, forwarded or validated.
- Non-goal: changing the `store_id` result-field description in `ROOT_SCHEMA`, the skills or the README.

## Decisions

### One literal sentence, not a shared constant

The JSON Schema is assembled per tool and sent to the model as plain text; a shared constant would still serialize to the same repeated string. The shortest correct form is the literal `Registered store id.` in each parameter. A constant would hide the repetition from readers without saving a character, so the literal is simpler.

### Exact wording in the spec

The description is model-facing behavior, not an internal detail, so the spec names the exact sentence. A looser requirement such as “one short sentence” would let a later edit drift back to a long clause while still passing a length-only assertion.

### Test at the registered-tool boundary

The existing `test/descriptions.test.mjs` already walks every registered tool's descriptions. The new assertion reuses that walk, checks every `parameters.properties.store.description`, and names the offending tool on failure. This catches a divergence in any file without coupling the test to source paths.

## Risks / Trade-offs

- [The model loses the inline reminder to pass `store` on every call] → The `openspec-apply-change` skill states it at line 20, and the parameter remains present on every tool; the two recorded store calls show the model already finds it without the clause.
- [Wording drift returns] → The exact-value assertion fails on any change.

## Migration Plan

No migration. The change is a text replacement plus a test; revert the commit to roll back.

## Open Questions

None.
