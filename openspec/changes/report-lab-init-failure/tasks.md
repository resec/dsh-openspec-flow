# Tasks

## 1. Bound the failure output

- [x] 1.1 Add `OUTPUT_SUMMARY_LIMIT` and `summarizeOutput` to `scripts/lab/core/process.mjs`: keep the head and the tail within the budget, mark the omission, and treat a non-string input as empty. Verify by importing the module from `node -e` and printing a 4,000-character output whose first line reads `Error: boot failed`.
- [x] 1.2 Use the helper in the `ensureProfile` failure path in `scripts/lab/index.mjs` instead of the tail-only slice. Verify by reading the message construction and by `npm run test:lab -- --mock-only` reaching the same failure point as before.

## 2. Guard the behaviour

- [x] 2.1 Add `test/lab-process.test.mjs`: an over-long output keeps its first line and its last line and carries the marker; an output within the budget arrives unchanged; the retained text does not grow with a much larger output; a non-string input summarizes to an empty string. Verify with `node --test test/lab-process.test.mjs`.
- [x] 2.2 Confirm the new test fails against the previous tail-only behaviour, then passes against the helper. Verify by temporarily reverting the assertion target in a scratch run and observing the red result.

## 3. Validate the change

- [x] 3.1 Run `./node_modules/.bin/openspec validate report-lab-init-failure --strict` and confirm it reports the change as valid.
- [x] 3.2 Run `npm test`, `npm run openspec:check` and `npm run verify` on Node 24 and record the pass counts and the coverage verdict. Verify by the exit status of each command.
- [x] 3.3 Run `node scripts/check-pr-change.mjs --base origin/main` and confirm it accepts the change with no unchecked task and no restricted path.

## Workflow follow-up

- The maintainer archives this change after merge; the pull request does not archive it.
