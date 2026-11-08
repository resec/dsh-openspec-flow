# Tasks

## 1. Contract inventory and script core

- [x] 1.1 Add `scripts/cli-contract.json` listing every CLI command the plugin runs, with its argv and the JSON fields each projection reads; verify `node -e "JSON.parse(require('fs').readFileSync('scripts/cli-contract.json'))"` succeeds and every command entry has `args` and `fields`.
- [x] 1.2 Add the pure functions in `scripts/check-cli-contract.mjs` (`shapeOf`, `mergeShapes`, `diffShapes`, `checkConsumed`, `parseArgs`); verify the module imports under Node 24 and exports every function.
- [x] 1.3 Add `test/cli-contract.test.mjs` covering shape extraction, array merging, diff reporting, consumed-field passes and failures, empty-array warnings, non-JSON output, and argument validation; verify `node --test test/cli-contract.test.mjs` passes.
- [x] 1.4 Add fixture construction, the command sequence from `design.md`, exit-code/stderr capture, `--candidate`/`--candidate-bin` resolution and `--help`; verify `node scripts/check-cli-contract.mjs --candidate-bin node_modules/@fission-ai/openspec/bin/openspec.js` exits zero and `--help` prints usage.

## 2. Entry point and documentation

- [x] 2.1 Add `contract:check` to `package.json` scripts; verify `npm run contract:check -- --help` prints usage and exits zero.
- [x] 2.2 Add `docs/upgrading-openspec-cli.md` covering the decision inputs, the file-level coupling inventory, the ordered edit sequence, the test matrix, the contract check's purpose and usage, release, and rollback; verify every referenced path exists and every command in the guide runs as written.
- [x] 2.3 Link the guide from the version-compatibility section of `README.md`; verify the link target exists and the README sentence states when to read it.

## 3. Integration verification

- [x] 3.1 Run `npm run contract:check` with the pinned CLI as both baseline and candidate and confirm zero breaking differences; verify the command exits zero and reports no missing or type-changed fields.
- [x] 3.2 Run `npm test` on Node 24 and confirm the existing suite and the new test file pass; verify the exit code is zero.
- [x] 3.3 Run `npm run coverage:check` on Node 24 and confirm the gate passes without lowering the baseline; verify the exit code is zero.
- [x] 3.4 Run `openspec_validate add-cli-upgrade-guide` and confirm the change validates; verify the result reports `valid: true`.

## Workflow follow-up

- Archive the change only when the user asks.
- After archiving, commit the archive, the documentation, the script and the merged specs in one commit and push to `origin/main`.
