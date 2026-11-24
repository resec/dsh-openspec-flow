# Tasks

## 1. Classify a re-emitted head

- [x] 1.1 Read the apply review record and set `resume` only when a round reviewed the prepared head's tree.
- [x] 1.2 Emit a prepared head without a record for its first start, and keep a new head as a new round.

## 2. Document and guard

- [x] 2.1 Add the prepared-without-record branch to the `docs/pr-review.md` session flow.
- [x] 2.2 Update the prepared/failed assertions and add the documentation keyword assertion.

## 3. Verify

- [x] 3.1 Run `node --test test/pr-review-watch.test.mjs`: 31 tests pass.
- [x] 3.2 Confirm the new assertions fail against the previous classification: setting `resume: true` again fails both the prepared-head start test and the new-head test.
- [x] 3.3 Run `openspec validate fix-watch-prepared-start --strict`, `npm run openspec:check` and `npm run verify`.
