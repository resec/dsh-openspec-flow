# Tasks

## 1. Name the kind in the next action

- [x] 1.1 Return `review=apply` from `retry` when the record is an apply review.
- [x] 1.2 Do the same in `replace`; keep the draft action unchanged.

## 2. Guard the behaviour

- [x] 2.1 Add a test with a hand-written apply record that carries a reviewer slot and a locked reviewer model.
- [x] 2.2 Confirm the test fails against the previous next action.

## 3. Verify

- [x] 3.1 Run `node --test test/review-reviewer.test.mjs`.
- [x] 3.2 Run `openspec validate fix-review-retry-next-action --strict`, `npm run openspec:check` and `npm run layout:check`.
