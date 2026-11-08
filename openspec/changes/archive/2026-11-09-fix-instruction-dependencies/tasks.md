# Tasks

## 1. Projection

- [x] 1.1 Add `projectArtifactIds` and use it for `dependencies` and `unlocks` in `lib/state.js`; cover a descriptor, a string and an id-less entry in `test/projections.test.mjs`; verify `node --test test/projections.test.mjs` passes on Node 24.
- [x] 1.2 Assert real-CLI results for `proposal`, `specs`, `design` and `tasks` in `test/integration.test.mjs`: `dependencies` are `[]`, `["proposal"]`, `["proposal"]`, `["specs","design"]`, `unlocks` are `["specs","design"]`, `["tasks"]`, `["tasks"]`, `[]`, and no entry is `[object Object]`; verify `node --test test/integration.test.mjs` passes on Node 24.

## 2. Verification

- [x] 2.1 Run `openspec_validate fix-instruction-dependencies` and `npm test` on Node 24; verify both report no errors.
- [x] 2.2 Run `npm run coverage:check` on Node 24; verify no violations.

## Workflow follow-up

- Archive the change and commit the archive, tests and merged spec together after review.
- Push to `origin/main` after the user asks.
