# Tasks

## 1. Enumerate the actions

- [x] 1.1 List the thirteen actions in the "Draft review is exposed as one tool" requirement and drop the stale reviewer sentence.
- [x] 1.2 Name the four reviewer actions in a new "Apply review accepts the reviewer actions" requirement, leaving the apply requirement's text unchanged.
- [x] 1.3 Update the `action` description in `lib/tools/review.js`.

## 2. Guard the description

- [x] 2.1 Add a test that reads the registered `action.enum` and asserts the description is exactly the rendered enum, so a substring such as `waive` inside `waive-reviewer` cannot satisfy it.
- [x] 2.2 Confirm the test fails against the previous description.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-review-action-enumeration --strict`.
- [x] 3.2 Run `npm run verify` on Node 24 and verify the test summary and the coverage verdict pass.
- [x] 3.3 Run `npm run openspec:check` and `npm run layout:check`.
