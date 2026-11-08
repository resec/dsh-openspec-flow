# Tasks

## 1. Projection and schema

- [x] 1.1 Add `blockedBy` and structured `nextSteps` to `projectStatus`, accept an optional store id, and verify the new unit cases pass with `node --test test/state-projections.test.mjs`
- [x] 1.2 Add the two fields to the status output schema and descriptions and pass `args.store` from the tool, then verify `node --test test/descriptions.test.mjs` passes

## 2. Integration and documentation

- [x] 2.1 Add integration cases for incomplete planning, complete planning, store propagation and absence of command text, then verify `node --test test/integration.test.mjs` passes
- [x] 2.2 Update the status row in `README.md` and verify it names `blockedBy` and tool actions consistently with the result

## 3. Verification

- [x] 3.1 Run `openspec_validate status-blocked-by-and-tool-actions`, `npm test` and `npm run coverage:check` on Node 24 and report the results

## Workflow follow-up

- Archive this change only when the user asks.
- After archiving, commit the archive, the documentation and the merged specs in one commit, then push to `origin/main`.
