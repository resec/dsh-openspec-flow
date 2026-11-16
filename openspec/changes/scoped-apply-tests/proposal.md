# Proposal: scope apply test runs to the touched modules

## Why

Apply work verifies each task batch with the full suite. Over the last three days of this repository's activity the flow ran the full suite 95 times for 69 minutes (median 50.9 s per run, `job/settled` timings from 55 sessions), while the suite is lopsided: running the 36 files one at a time takes 169.3 s in total, six files hold 159.3 s of that (94%), and the other 30 files take 10.0 s together. The whole suite took 77-91 s across three parallel runs on a loaded 4-core machine, so wall clocks are quoted as a range and the additive total is used for comparisons.

A selector keyed on the import graph only pays off if it does not follow the plugin entry module. Measured on this checkout, a change to `lib/review/brief.js` reaches 14 of the 36 test files when imports are followed through `index.js` (including `test/review-apply.test.mjs` at 52.4 s), and 2 files when `index.js`, `client.js`, `reviewer.js` and `lib/tools/index.js` are treated as assembly barriers: `test/review-unit.test.mjs` (0.26 s) and `test/review-reviewer.test.mjs` (12.1 s). Those are the design's additive per-file times; a scoped run of the two is dominated by the slower file. The barrier reading is the only one that saves time; the indirect tests it skips are covered by the full run at the end of apply.

## What Changes

- Add a development-only selector, `scripts/affected-tests.mjs`, that returns the test files importing a changed module directly or through a test helper, and stops at the plugin entry modules instead of expanding them.
- Select the full suite when a changed path is an entry module (`index.js`, `client.js`, `reviewer.js`, `lib/tools/index.js`), has no importing test, or lies outside the source and test trees. A clean working tree with no path argument is an error, not a silent full run.
- Give the selector the same test environment as the full runner: the `.cache/node-compile` compile cache and the `node-version` preflight, so a scoped run and a full run share one runtime contract.
- Add the `test:affected` npm script (`--list` prints, `--run` executes and forwards the exit status; `--list` wins when both appear).
- State the rule in `AGENTS.md` and `README.md`: after each task batch run `npm run test:affected -- <paths>`, and when every task is done run `npm run verify` once. The packaged `openspec-apply-change` skill is left unchanged: it is shipped to other projects, which do not have this script.
- Add `test/affected-tests.test.mjs` pinning the selection rules, the exit-status forwarding and the clean-tree error.

The completion gate does not move. `npm run verify` is the single completion entry, and a scoped run never stands in for it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: adds the rule that apply verifies a touched module with the tests importing it and falls back to the full suite, and adds the rule that the scoped entrypoint reuses the compile cache and the runtime preflight.

## Impact

- New files: `scripts/affected-tests.mjs`, `scripts/test-env.mjs`, `test/affected-tests.test.mjs`.
- Modified: `package.json` (one script entry), `scripts/run-tests.mjs` (use the shared test environment module, no behavior change), `AGENTS.md` (apply step 4 and the verification sentence), `README.md` (the self-hosted development section), and `openspec/specs/development-workflow/spec.md` through the delta spec.
- Not modified: `skills/**`. The shipped apply skill stays project-agnostic; only repository docs name `npm run test:affected`.
- No `lib/` runtime code changes. `scripts/` and `test/` are outside the coverage include list (`lib/**`, `index.js`), so the recorded coverage percentages do not move.
- Paragraph overlap with the in-flight changes: `merge-verification-entry` rewrote the verification command to `npm run verify` and `reuse-coverage-stamp-on-push` edits the hook paragraph. This change adopts `npm run verify` as the gate and adds the batch-verification sentence in a different part of the apply step; whoever lands second reconciles the shared `AGENTS.md` and `README.md` wording.
