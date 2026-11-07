# Tighten the schema boundary

## Why

The plugin declares that it only supports the built-in `spec-driven` schema, but two surfaces do not follow that boundary: `openspec_schemas` lists every schema the CLI knows, including custom and shadowed ones, and `openspec_new_change` can create a change under a project-selected schema that every later change-scoped tool rejects. This produces a choose-then-fail loop and can leave a change that cannot be applied. The README also has no single view of which OpenSpec workflows the plugin covers.

## What Changes

- `openspec_schemas` returns only the schemas the plugin supports: the package `spec-driven` schema. Project-local or user-level shadow copies and custom schemas are omitted.
- `openspec_new_change` checks the schema before writing. When `openspec/config.yaml` selects a schema other than `spec-driven`, or the built-in `spec-driven` is shadowed, it rejects and creates no change directory. When it creates a change, it passes `--schema spec-driven` and verifies the created change reports that schema.
- `README.md` gains a flow coverage table with supported, partial, and unsupported workflows, so the plugin's boundary is visible without reading the code.
- Tests cover the supported-only listing, the pre-write rejection, and the normal creation path.

## Capabilities

### Modified Capabilities

- `schema-compatibility`: adds the `openspec_new_change` pre-write schema gate.
- `tool-surface`: requires `openspec_schemas` to list only supported schemas.

## Impact

- `lib/schema.js`: read the project's configured schema and expose the support check.
- `lib/tools/query.js`: filter the schema listing.
- `lib/state.js`: project only supported schemas.
- `lib/tools/write.js`: gate `openspec_new_change` before calling the CLI.
- `README.md`: add the flow coverage table and align the schema wording.
- `test/schema.test.mjs`, `test/state-projections.test.mjs`, `test/integration.test.mjs`: regression coverage.
