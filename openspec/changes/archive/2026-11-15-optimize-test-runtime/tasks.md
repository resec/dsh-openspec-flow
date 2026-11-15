# Tasks

## 1. Compile cache

- [x] 1.1 Set `NODE_COMPILE_CACHE` to the absolute `join(ROOT, '.cache', 'node-compile')` in `scripts/run-tests.mjs` for plain runs, and delete an inherited value when coverage is enabled; verify `npm test` passes, the directory exists afterwards, a second run reuses it, and the fixture cleanup asserts no recorded fixture root holds `.cache` before removing it
- [x] 1.2 Add `.cache/` to `.gitignore`; verify `git check-ignore .cache/node-compile` exits 0
- [x] 1.3 Document the compile cache, its cold/warm behavior and the coverage exception in the README verification section; verify the documented text matches the entrypoint

## 2. Poll interval

- [x] 2.1 Add a `reviewPollMs()` helper in `lib/tools/review.js` reading `OPENSPEC_FLOW_REVIEW_POLL_MS` (default 250, range 10-60000) and use it in `waitReview`; verify one unit test covers the default, an in-range value, a non-numeric value and an out-of-range value in a single `test(` registration
- [x] 2.2 Set the poll interval to 10 ms, drop the 350 ms pre-submit delay, and replace the 1.5 s and 2 s pre-action delays with a bounded 300 ms delay in the three review wait cases, restoring the previous value in `finally`; verify the three cases pass, their combined wall time is below 3 s, and the in-loop record-disappeared and cancellation branches still run
- [x] 2.3 Document the environment variable and its bounds in the README and `docs/review.md`; verify both documents name `OPENSPEC_FLOW_REVIEW_POLL_MS` with the same default and range

## 3. Review test split

- [x] 3.1 Create `test/review-fixtures.mjs` holding the shared fixtures, `PROBE_ROOT`, `CHANGE`, `DRAFT_OPENING`, `CREATED` and `cleanupFixtures()`; verify it imports cleanly and is not listed by `run-tests.mjs`
- [x] 3.2 Split the 106 review cases into `review-draft`, `review-apply`, `review-reviewer` and `review-wait` test files and delete `review.test.mjs`; verify `grep -c '^test('` sums to the 106 recorded before the split, every new test file imports fixtures only from `test/review-fixtures.mjs`, and `npm test` passes
- [x] 3.3 Verify the default parallel wall time of `npm test` is at most 50 s and record the measured value; verify the 412 split cases are present and the suite reports 413 cases with the added poll-interval unit test

## 4. npm pack assertion

- [x] 4.1 Normalize the `npm pack --dry-run --json` payload to one entry for both the npm 11 array and the npm 12 object in `test/review-client.test.mjs`; verify `the package exports the client half and packs it` passes

## 5. Integration checks

- [x] 5.1 Verify `openspec_inspect` with `action: "validate"` and `strict: true` passes for the change
- [x] 5.2 Verify `npm test` reports 413 passing cases and no failures
- [x] 5.3 Verify `npm run coverage:check` passes with the compile cache removed

## Workflow follow-up

- Commit the implementation before apply review.
- Run apply review after the commit and fix every blocker.
- Archive the change only when the user asks, after the apply review is ready.
