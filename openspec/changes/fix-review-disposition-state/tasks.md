# Tasks

## 1. Guard the disposition

- [ ] 1.1 In `lib/review/report.js`, refuse a disposition whose finding is already `verified` or `waived`; the error names the current status, says the finding is closed and directs no further disposal.
- [ ] 1.2 In `docs/review.md`, state that a `verified` or `waived` finding cannot be disposed again.

## 2. Assert the refusal

- [ ] 2.1 In `test/review-unit.test.mjs`, assert that `disposeFinding` refuses both closed statuses and leaves the finding unchanged.
- [ ] 2.2 In `test/review-draft.test.mjs`, assert for a draft review that the single form, `waive` and a `dispositions` batch are refused on a closed finding and that the record bytes and the passed state do not change.
- [ ] 2.3 In `test/review-apply.test.mjs`, assert the same refusal and batch atomicity for an apply review.
- [ ] 2.4 Confirm the new assertions fail with the precondition removed.

## 3. Verify

- [ ] 3.1 Run `node --test test/review-unit.test.mjs test/review-draft.test.mjs test/review-apply.test.mjs test/review-doc.test.mjs`.
- [ ] 3.2 Run `openspec validate fix-review-disposition-state --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-generated-skills.mjs --base <main>`, `npm run check:pr` and `npm run verify`.
