# Tasks

## 1. Projection

- [x] 1.1 Add optional `store_id` to `ROOT_SCHEMA` and copy it into the context root, then verify `node --test test/projections.test.mjs` covers a store-selected root
- [x] 1.2 Project top-level and member diagnostics through one projector that keeps `severity`, `code`, `message` and `fix`, then verify `node --test test/projections.test.mjs` asserts those fields
- [x] 1.3 Project members as explicit objects and map an available member's `fetch` to an `openspec_show` action with `type: "spec"`, the member store and a note about `name`, then verify the projection test rejects command text
- [x] 1.4 Update the context output schema and description to the new shapes, then verify `node --test test/descriptions.test.mjs test/shared.test.mjs` passes

## 2. Existing tests and documentation

- [x] 2.1 Update `test/state-projections.test.mjs` for structured status and the empty-member path, then verify `node --test test/state-projections.test.mjs` passes
- [x] 2.2 Add the nearest-root context assertions to `test/integration.test.mjs` and update the context row in `README.md`, then verify `node --test test/integration.test.mjs` passes and the README names store identity and diagnostics
- [x] 2.3 Record `root.store_id` in `scripts/cli-contract.json` and verify `node --test test/cli-contract.test.mjs` passes

## 3. Verification

- [x] 3.1 Run `openspec_validate repair-context-projection`, `npm test` and `npm run coverage:check` on Node 24, then report the results

## Workflow follow-up

- Archive this change only when the user asks.
- After archiving, commit the archive, the documentation and the merged specs in one commit, then push to `origin/main`.
