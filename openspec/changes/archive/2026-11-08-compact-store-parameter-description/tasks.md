# Tasks

## 1. Compress store descriptions

- [x] 1.1 Replace the eleven `store` parameter descriptions in `lib/tools/query.js`, `lib/tools/write.js` and `lib/tools/apply.js` with `Registered store id.`; verify `grep -rn "description: 'Registered store id.'" lib/tools | wc -l` reports 11 and `grep -rn "pass it" lib/tools` reports none.
- [x] 1.2 Add a test to `test/descriptions.test.mjs` that walks every registered tool, asserts each `parameters.properties.store.description` equals `Registered store id.`, and names the offending tool on mismatch; verify `node --test test/descriptions.test.mjs` passes and fails when one description is temporarily changed.

## 2. Verification

- [x] 2.1 Run `npm test` and `npm run coverage:check` on Node 24, then call `openspec_validate` for `compact-store-parameter-description`; verify both pass and the change reports `valid: true` with no errors.

## Workflow follow-up

- Archive the change only when the user asks.
- After archiving, commit the archive, the merged spec and the test together and push to `origin/main`.
