# Tasks

## 1. Move the harness tests

- [x] 1.1 Move the nine `test/eval-*.test.mjs` files into `eval/test/` and update their imports to `../lib/*` and their repository/sample paths, and verify `node --test eval/test/` passes all 43 tests.
- [x] 1.2 Verify the runtime suite no longer discovers the harness tests by running `node --test test/` and confirming the count drops to the plugin runtime tests.

## 2. Scripts and documentation

- [x] 2.1 Add `test:eval` and `test:all` scripts while keeping `test` on `node --test test/`, and verify all three commands exit 0 with the expected counts.
- [x] 2.2 Update `AGENTS.md`, `README.md` and `eval/README.md` to name the suite each change must run, and verify the documented commands are the ones in `package.json`.

## 3. Pending spec correction and final validation

- [x] 3.1 Change the evaluation-harness scenario in the unarchived `add-model-e2e-eval` change from `node --test test/` to `npm run test:eval`, and verify `openspec_validate separate-eval-tests` and `openspec_validate add-model-e2e-eval` both pass.
- [x] 3.2 Run `npm run test:all` and confirm every runtime and harness test passes in one invocation.
