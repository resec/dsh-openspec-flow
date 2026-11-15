# Proposal: optimize-test-runtime

## Why

The plugin suite spends almost all of its time starting real OpenSpec CLI child processes: the current tree spawns the CLI 585 times at 133-153 ms each. `test/review.test.mjs` alone spawns it 465 times, holds 106 of the suite's 412 cases, and takes 74.5 s of the 79.8 s default parallel wall time because Node runs the cases inside one file serially. Three fixed sleeps add 3.85 s of idle time, and the `npm pack` assertion only reads the array shape that npm 11 prints, so the same test fails on npm 12, which prints an object keyed by package name.

## What Changes

- Split `test/review.test.mjs` into four topic files (`review-draft`, `review-apply`, `review-reviewer`, `review-wait`) and move the shared helpers into `test/review-fixtures.mjs`. All 106 review cases and their assertions stay unchanged; only their file placement and imports change.
- Enable Node's compile cache for plain test runs by setting `NODE_COMPILE_CACHE` to the absolute `.cache/node-compile` directory under the repository root, and ignore `.cache/`. The coverage run does not enable the cache because Node documents that bytecode deserialised from the compile cache makes V8 coverage less precise.
- Make the reviewer wait poll interval configurable through `OPENSPEC_FLOW_REVIEW_POLL_MS` (default `250`, accepted range `10`-`60000`). Tests set it to `10` ms, drop the 350 ms pre-submit delay, and replace the 1.5 s and 2 s pre-action delays with a bounded 300 ms delay sized to the context load, cutting that idle time from 3.85 s to about 0.6 s.
- Fix the `the package exports the client half and packs it` assertion so it reads the `npm pack --dry-run --json` payload whether npm returns the legacy array or the npm 12 object.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the requirement that the changer waits for the reviewer report now states the poll interval and its overridable environment variable.
- `development-workflow`: adds the compile cache used by plain test entrypoints and the focused review test layout.

## Impact

- Code: `lib/tools/review.js` (wait poll interval), `scripts/run-tests.mjs` (compile cache), `.gitignore`.
- Tests: `test/review.test.mjs` is replaced by four files plus `test/review-fixtures.mjs`; `test/review-client.test.mjs` fixes the npm pack assertion.
- Documentation: `README.md` gains the test runtime notes; `docs/review.md` documents the poll override.
- No tool surface, CLI pin, config schema or review record format changes.
- Expected wall time: 79.8 s to about 40-45 s in the default parallel run; the suite keeps every existing case and adds one poll-interval unit test (413 total), so it must stay green.
