# Tasks

## 1. Shared test environment

- [ ] 1.1 Add `scripts/test-env.mjs` exporting the absolute `.cache/node-compile` path, `plainTestEnv()` (creates the directory, sets `NODE_COMPILE_CACHE`), `coverageTestEnv()` (deletes an inherited `NODE_COMPILE_CACHE`, creates no cache directory) and `testEnvFor(coverage)` that dispatches between them, then switch `scripts/run-tests.mjs` to call `testEnvFor(coverage)` instead of building the environment inline; verify two consecutive `node scripts/run-tests.mjs plugin` runs pass on Node 24, `.cache/node-compile` exists after them while `git status --porcelain` does not list it, and `node -e "import('./scripts/test-env.mjs').then(m => console.log(m.testEnvFor(true).NODE_COMPILE_CACHE ?? 'unset'))"` prints `unset`

## 2. Scoped selector

- [ ] 2.1 Add `scripts/affected-tests.mjs` with `export function selectAffectedTests({ root, paths, all })` and `export async function main(argv, { version, spawn })`: walk static relative `from '<path>'` imports from each `test/*.test.mjs` through local helpers, stop at `index.js`, `client.js`, `reviewer.js` and `lib/tools/index.js`, select the full suite for a changed entry module or an empty match, select a changed test file itself, resolve a rename entry of `git status --porcelain` to its last path, make `--all` bypass the working-tree read and never error, make `--list` win over `--run` and start no process, run `assertCurrentNode()` before executing, and pass `plainTestEnv()` to the child `node --test`; verify `node scripts/affected-tests.mjs --list lib/review/brief.js` names `test/review-unit.test.mjs` and `test/review-reviewer.test.mjs` and omits `test/review-apply.test.mjs`
- [ ] 2.2 Add `test/affected-tests.test.mjs` pinning: a directly imported module, a module reached through a test helper (`test/review-fixtures.mjs`), an entry module path, an empty match, a changed test file, `--all` on a clean tree, stable sorted output with no duplicates, the nonzero exit for an empty change set, the `.cache/node-compile` path both entrypoints share, `testEnvFor(false)` carrying `NODE_COMPILE_CACHE` while `testEnvFor(true)` carries none, a rejected injected `version` stopping before any test, an injected `spawn` returning non-zero and that status surfaced, and `--list` with `--run` starting nothing; verify `node --test test/affected-tests.test.mjs` passes on Node 24
- [ ] 2.3 Add the `test:affected` npm script that runs the CLI with `--run`; verify `npm run test:affected -- --list lib/state.js` lists the state test files and `npm run test:affected -- --list index.js` lists every test file

## 3. Workflow documentation

- [ ] 3.1 Add the batch rule to `AGENTS.md` step 4: after a task batch run `npm run test:affected -- <paths>`; leave step 5 and the `## Verification` paragraph untouched; verify every command named is defined by `package.json` scripts
- [ ] 3.2 Update the self-hosted development section of `README.md` with the same rule and the selector's list/run usage; verify each documented command runs as written and `skills/**` stays untouched
- [ ] 3.3 Re-read the delta spec against the implementation and the two documentation files, fix any drift, and verify `openspec_inspect` with `action: "validate"` and `strict: true` reports no warning

## 4. Integration verification

- [ ] 4.1 After committing tasks 1.1-3.3, change `lib/review/brief.js` only and run the bare `npm run test:affected` so the working tree drives the selection; verify the selected set is exactly `test/review-unit.test.mjs` and `test/review-reviewer.test.mjs`, the run takes about ten seconds rather than the full-suite wall clock, and its summary matches a direct `node --test test/review-unit.test.mjs test/review-reviewer.test.mjs` on the same two files; restore the file afterwards
- [ ] 4.2 Run `npm run verify` on Node 24 and verify every test passes and the coverage percentages are unchanged, confirming `scripts/` and `test/` stay outside the coverage include list
