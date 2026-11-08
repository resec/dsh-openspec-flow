# Proposal: repair the context projection

## Why

`openspec_context` is the only read tool that returns the working set a project declares: the resolved root, the stores it references and their diagnostics. Its projection drops the parts that make that payload useful. The root loses the CLI's `store_id`, top-level diagnostics lose `code` and `fix`, and an available referenced store's `fetch` recipe is passed through as `openspec show <spec-id> --type spec --store <id>`, a shell command the tool surface exists to replace. The tool is kept; the projection is repaired.

## What Changes

- Preserve `root.store_id` when the CLI resolves a store-selected root.
- Project top-level and member diagnostics as objects that keep `severity`, `code`, `message` and `fix`, instead of flattening them to message strings.
- Project an available referenced store's `fetch` recipe as a tool action naming `openspec_show` with `type: "spec"` and the member's store id, plus a note that `name` must be a spec id from that store.
- Project members with an explicit schema (`role`, `id`, optional `path`, optional `fetch`, `status`) instead of passing them through unchanged.
- **BREAKING** `status` changes from `string[]` to diagnostic objects; `members[].fetch` changes from a string to an object.
- Update the context output schema, tool description, README and tests.

## Capabilities

### Modified Capabilities

- `tool-surface`: the context projection preserves store identity and diagnostic recovery text, and exposes a referenced store's fetch as a tool action.

## Impact

- `lib/state.js`: `projectContext` projects the root store id, members and diagnostics.
- `lib/tools/shared.js`: `ROOT_SCHEMA` gains optional `store_id`.
- `lib/tools/query.js`: context output schema and description.
- `test/projections.test.mjs`, `test/state-projections.test.mjs`, `test/integration.test.mjs`.
- `README.md`: context row.
- No dependency, package, skill or policy changes.
