# Tasks

## 1. Bound the failure output

- [x] 1.1 Add `OUTPUT_SUMMARY_LIMIT` and `summarizeOutput` to `scripts/lab/core/process.mjs`: keep the head and the tail within the budget, mark the omission, and treat a non-string input as empty. Verify by importing the module from `node -e` and printing a 4,000-character output whose first line reads `Error: boot failed`.
- [x] 1.2 Use the helper in the `ensureProfile` failure path in `scripts/lab/index.mjs` instead of the tail-only slice. Verify by reading the message construction and by `npm run test:lab -- --mock-only` reaching the same failure point as before.

## 2. Guard the behaviour

- [x] 2.1 Add `test/lab-process.test.mjs`: an over-long output keeps its first line and its last line and carries the marker; an output within the budget arrives whole; the retained text does not grow with a much larger output; a non-string input summarizes to an empty string. Verify with `node --test test/lab-process.test.mjs`.
- [x] 2.2 Confirm the new test fails against the previous tail-only behaviour, then passes against the helper. Verify by temporarily reverting the assertion target in a scratch run and observing the red result. Observed: with the tail-only slice four cases failed; with the helper all pass.

## 3. Validate the change

- [x] 3.1 Run `./node_modules/.bin/openspec validate report-lab-init-failure --strict` and confirm it reports the change as valid.
- [x] 3.2 Run `npm test`, `npm run openspec:check` and `npm run verify` on Node 24 and record the pass counts and the coverage verdict. Verify by the exit status of each command.
- [x] 3.3 Run `node scripts/check-pr-change.mjs --base origin/main` and confirm it accepts the change with no unchecked task and no restricted path.

## 4. Address the review

- [x] 4.1 Remove the caller-supplied `limit` from `summarizeOutput`: with a budget of two or less the head consumed the whole budget, the tail length became zero and `slice(-0)`, which is `slice(0)`, returned the entire output. Verify with `node --input-type=module -e` on the former limits 0, 1, 2 and 2.5 and with `npm test`.
- [x] 4.2 Write the untouched initialization output to `<run>/artifacts/init-<mode>.log` and name that file in the failure, so the requirement that the output stays in the run directory holds. Verify by reading `ensureProfile` and by the message assertions in `test/lab-process.test.mjs`.
- [x] 4.3 Cover the message builder apart from the split (`profileInitFailure`), replace the `deepEqual` on numbers with `equal`, and drop the repeated `startsWith` assertions. Verify with `node --test test/lab-process.test.mjs`.
- [x] 4.4 State the whitespace rule in the delta spec and stop claiming the message starts or ends with the output, because the profile name prefixes it and the artifact path follows it. Verify with `openspec validate report-lab-init-failure --strict`.
- [x] 4.5 Run `npm run layout:check` and record its result, as `CONTRIBUTING.md` asks before a push. Verify by the exit status.

## 5. Close the second review

- [x] 5.1 Move the write behind `recordProfileInitFailure` in `scripts/lab/core/profile-init.mjs`, so the persistence has a seam a test can drive with a temporary directory. Verify with `node --test test/lab-profile-init.test.mjs`, and by deleting the write to observe all three cases fail.
- [x] 5.2 Degrade instead of masking: a rejected write returns the message without a file path. Verify with the write-failure case against an absent directory.
- [x] 5.3 Replace the unreachable `Math.min` guard with an exported `OUTPUT_SUMMARY_HEAD`, assert the head-below-limit invariant in the tests, and return the output whole when a summary would not shorten it. Verify with the boundary cases at `OUTPUT_SUMMARY_LIMIT + 1` and at `OUTPUT_SUMMARY_LIMIT + marker + 1`.
- [x] 5.4 Keep an empty output readable as `no output` rather than a bare colon. Verify with the empty-output case.
- [x] 5.5 Name `init-<mode>.log` in `docs/lab.md`, restore the Non-Goal about other lab error messages, and align the proposal with the two requirements. Verify with `npm test` and `openspec validate report-lab-init-failure --strict`.

## Workflow follow-up

- The maintainer archives this change after merge; the pull request does not archive it.
