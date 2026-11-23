# Tasks

## 1. Enumerate the actions

- [x] 1.1 List the thirteen actions in the "Draft review is exposed as one tool" requirement and drop the stale reviewer sentence.
- [x] 1.2 Name the four reviewer actions in a new "Apply review accepts the reviewer actions" requirement, leaving the apply requirement's text unchanged.
- [x] 1.3 Update the `action` description in `lib/tools/review.js`.

## 2. Guard the description

- [x] 2.1 Add a test that reads the registered `action.enum` and asserts each value appears in the description.
- [x] 2.2 Confirm the test fails against the previous description.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-review-action-enumeration --strict`.
- [x] 3.2 Run `node --test test/descriptions.test.mjs`, `npm run openspec:check` and `npm run layout:check`.
