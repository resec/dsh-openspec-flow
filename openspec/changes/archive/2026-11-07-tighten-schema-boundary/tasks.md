# Tasks

## 1. Schema check primitives

- [x] 1.1 Add a project-schema reader and a pre-write check to `lib/schema.js`; verify `node --test test/schema.test.mjs` covers quoted, commented, custom, missing, and unreadable configurations.
- [x] 1.2 Add unit tests for the shadowed built-in path in `openspec_new_change`; verify `node --test test/schema.test.mjs` passes.

## 2. Schema listing

- [x] 2.1 Add a supported-schema projection and use it in `openspec_schemas`; verify `node --test test/state-projections.test.mjs` shows custom and shadowed entries are removed.
- [x] 2.2 Update the `openspec_schemas` description and output field description; verify `node --test test/descriptions.test.mjs` passes.

## 3. New-change gate

- [x] 3.1 Gate `openspec_new_change` before the create command, pass `--schema spec-driven`, and verify the returned schema; verify `node --test test/integration.test.mjs` covers custom-config rejection, shadow rejection, and normal creation.
- [x] 3.2 Confirm a rejected call leaves no change directory and an accepted call reports `schema: spec-driven`; verify the integration assertions for both paths.

## 4. Documentation

- [x] 4.1 Add the flow coverage table to `README.md` and align the `openspec_schemas` and `openspec_new_change` rows; verify every row has a supported, partial, or unsupported status and the custom-schema row says unsupported.

## 5. Verification

- [x] 5.1 Run `openspec_validate tighten-schema-boundary`; verify it reports valid.
- [x] 5.2 Run `npm test` and `npm run coverage:check` with Node 24 on `PATH`; verify both pass.
