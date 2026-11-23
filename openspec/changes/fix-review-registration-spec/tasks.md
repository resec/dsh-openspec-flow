# Tasks

## 1. Replace the contradictory requirement

- [x] 1.1 Remove the "absent when disabled" requirement with a reason and migration note.
- [x] 1.2 Add the "follows the enabled reviews" requirement with three scenarios.

## 2. Guard the behaviour

- [x] 2.1 Add a test that loads the plugin with only the apply review enabled and with both disabled.
- [x] 2.2 Narrow the existing absence test in `test/review-draft.test.mjs` to the both-disabled case and rename it.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-review-registration-spec --strict`.
- [x] 3.2 Run `node --test test/admin.test.mjs test/review-draft.test.mjs` and `npm run openspec:check`.
- [x] 3.3 Run `npm run verify` on Node 24 and verify the test summary and the coverage verdict pass.
